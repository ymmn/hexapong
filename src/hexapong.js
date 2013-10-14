var hexapong = (function hexapong() {

    ///////////////////// Declarations of variables and constants //////////////////////
    var e;
    var PADDLE_SPEED = 4,
        PADDLE_DIMS = {
            length: 120,
            width: 10
        },
        BALL_RADIUS = 10,
        TARGET_FPS = 20;

    var KEYCODE_ENTER = 13,
        KEYCODE_SPACE = 32,
        KEYCODE_UP = 38,
        KEYCODE_LEFT = 37,
        KEYCODE_RIGHT = 39,
        KEYCODE_W = 87,
        KEYCODE_A = 65,
        KEYCODE_D = 68;


    var lfHeld, rtHeld;
    var paddles, ball, arena;
    var stage;



    ///////////////////// Key Handlers //////////////////////
    document.onkeydown = handleKeyDown;
    document.onkeyup = handleKeyUp;

    function handleKeyDown(e) {
        //cross browser issues exist
        if (!e) {
            e = window.event;
        }
        switch (e.keyCode) {
        case KEYCODE_SPACE:
            shootHeld = true;
            return false;
        case KEYCODE_A:
        case KEYCODE_LEFT:
            lfHeld = true;
            return false;
        case KEYCODE_D:
        case KEYCODE_RIGHT:
            rtHeld = true;
            return false;
        case KEYCODE_W:
        case KEYCODE_UP:
            fwdHeld = true;
            return false;
        }
    }

    function handleKeyUp(e) {
        //cross browser issues exist
        if (!e) {
            e = window.event;
        }
        switch (e.keyCode) {
        case KEYCODE_SPACE:
            shootHeld = false;
            break;
        case KEYCODE_A:
        case KEYCODE_LEFT:
            lfHeld = false;
            break;
        case KEYCODE_D:
        case KEYCODE_RIGHT:
            rtHeld = false;
            break;
        case KEYCODE_W:
        case KEYCODE_UP:
            fwdHeld = false;
            break;
        }
    }




    ///////////////////// Class Definitions //////////////////////
    var Geometry = {

        /**
         * Detects whether a point is inside a convex polygon or not
         */
        isPointInsidePolygon: function (p, bounds) {
            var _getSide = function (a, b) {
                var x = a.x() * b.y() - a.y() * b.x();
                if (x < 0) return -1;
                else if (x > 1) return 1;
                else return 0;
            };

            var previous_side = null;
            for (var i = 0; i < bounds.length; i++) {
                var a = bounds[i];
                var b = bounds[(i + 1) % bounds.length];
                var affine_segment = b.subtract(a);
                var affine_point = p.subtract(a);
                var current_side = _getSide(affine_segment, affine_point);
                if (current_side === 0) {
                    return false;
                } else if (previous_side === null) {
                    previous_side = current_side;
                } else if (previous_side !== current_side) {
                    return false;
                }
            }
            return true;
        },

        getClosestPointToCircle: function(p1, p2, c) {
            var line = p2.subtract(p1);
            var pt = c.subtract(p1);
            var l_unit = line.toUnitVector();
            var proj = pt.dot(l_unit);
            if(proj <= 0) {
                return p1;
            } else if (proj >= line.magnitude()){
                return p2;
            }
            var proj_v = l_unit.multiply(proj);
            return proj_v.add(p1);
        },



    // def segment_circle(seg_a, seg_b, circ_pos, circ_rad):
    //     closest = closest_point_on_seg(seg_a, seg_b, circ_pos)
    //     dist_v = circ_pos - closest
    //     if dist_v.len() > circ_rad:
    //         return vec(0, 0)
    //     if dist_v.len() <= 0:
    //         raise ValueError, "Circle's center is exactly on segment"
    //     offset = dist_v / dist_v.len() * (circ_rad - dist_v.len())
    //     return offset

        lineIntersectCircle: function(line, circle) {
            var closestP = Geometry.getClosestPointToCircle(line[0], line[1], circle.center);
            var dist_v = circle.center.subtract(closestP);
            return dist_v.magnitude() <= circle.radius;
        },

        /**
         * Circle-rectangle collision detection
         */
        isCircleCollidingWithRect: function (circle, rect) {
            //rectangle edges: TL (top left), TR (top right), BL (bottom left), BR (bottom right)
            var edges = [
                [rect.tl, rect.tr],
                [rect.tl, rect.bl],
                [rect.bl, rect.br],
                [rect.tr, rect.br]
            ];
            var ret;
            for (var i = 0; i < edges.length; i++) {
               ret = Geometry.lineIntersectCircle(edges[i], circle);
               if(ret) {
                    return edges[i];
               }
            }
            return null;
        },

        /**
         *  Returns a normal vector rotated clockwise by n degrees
         */
        makeNormalVectorOfAngle: function (degrees) {
            var rad = Math.PI * degrees / 180;
            return $V([Math.cos(rad), Math.sin(rad)]);
        },

        getUnitNormalVectorFromEdge: function (edge) {
            var v = edge[1].subtract(edge[0]);
            return $V([-1 * v.y(), v.x()]).toUnitVector();
        },

        calculateVectorOfReflection: function (collisionAngle, normal) {
            return collisionAngle.subtract(normal.multiply(2 * collisionAngle.dot(normal)));
        }

    };

    /**
     * Hexagon-shaped arena for the game.  When the ball exits this area,
     * it has to be reset inside and someone gains a point.
     */
    function PongArena() {
        var _shape = new createjs.Shape();
        _shape.graphics.beginFill('rgba(255,255,205,1)').drawPolyStar(0, 0, 200, 6, 0, -90);
        _shape.x = 480;
        _shape.y = 200;
        var _boundingPoints;

        this.isPointInside = function (p) {
            return Geometry.isPointInsidePolygon(p, _boundingPoints);
        };

        this.getBoundingPoints = function () {
            _boundingPoints = _shape.graphics._instructions.map(function (a) {
                return a.params;
            }).filter(function (a) {
                return a.length > 0;
            }).slice(1, 7).map(function (a) {
                return $V(a).add($V([480, 200]));
            });
            return _boundingPoints;
        };

        this.shape = _shape;
    }


    function PongBall(direction_vec) {

        var _speed = 3;
        var _shape = new createjs.Shape();
        _shape.graphics.beginFill("red").drawCircle(0, 0, BALL_RADIUS);
        _shape.x = 0;
        _shape.y = 10;

        var _collideWithPaddle = function (rect) {
            var circle = {
                center: $V([_shape.x, _shape.y]),
                radius: BALL_RADIUS
            };
            var collidingEdge = Geometry.isCircleCollidingWithRect(circle, rect);

            if (collidingEdge !== null) {
                direction_vec = Geometry.calculateVectorOfReflection(direction_vec,
                    Geometry.getUnitNormalVectorFromEdge(collidingEdge));
                return true;
            }
            return false;
        };

        this.tick = function (paddles, arena) {
            for (var i = 1; i < 2; i++) {
                if (_collideWithPaddle(paddles[i].getBoundingPoints())) {
                    _shape.x += direction_vec.x() * _speed;
                    _shape.y += direction_vec.y() * _speed;
                    /* while (_collideWithPaddle(paddles[i].getBoundingPoints())) {
                        _shape.x += direction_vec.x() * _speed;
                        _shape.y += direction_vec.y() * _speed;
                   }*/
                }
                break;
            }
            if (!arena.isPointInside($V([_shape.x, _shape.y]))) {
                _shape.x = 0;
            }
            _shape.x += direction_vec.x() * _speed;
            _shape.y += direction_vec.y() * _speed;
        };

        this.shape = _shape;
    }


    function PongPaddle(ini_pos, direction_vec, bounds) {

        var _shape = new createjs.Shape();
        _shape.graphics.beginFill('rgba(255,0,0,1)').drawRect(0, 0, PADDLE_DIMS.length, PADDLE_DIMS.width);
        _shape.rotation = Math.atan(direction_vec.y() / direction_vec.x()) * (180 / Math.PI);
        _shape.x = ini_pos.x;
        _shape.y = ini_pos.y;

        /**
         * Returns the four corners of the rectangle in an object keys:
         * tl = top left corner
         * tr = top right corner
         * bl = bottom left corner
         * br = bottom right corner
         * each value is a vector
         */
        this.getBoundingPoints = function () {
            var ret = {};
            ret.tl = $V([_shape.x, _shape.y]);
            var rotated = rotateVectorClockwiseByDegrees({
                x: 0,
                y: -1 * PADDLE_DIMS.width
            }, _shape.rotation);
            ret.bl = $V([_shape.x + rotated.x,
                _shape.y + rotated.y
            ]);
            rotated = rotateVectorClockwiseByDegrees({
                x: PADDLE_DIMS.length,
                y: -1 * PADDLE_DIMS.width
            }, _shape.rotation);
            ret.br = $V([_shape.x + rotated.x,
                _shape.y + rotated.y
            ]);
            rotated = rotateVectorClockwiseByDegrees({
                x: PADDLE_DIMS.length,
                y: 0
            }, _shape.rotation);
            ret.tr = $V([_shape.x + rotated.x,
                _shape.y + rotated.y
            ]);
            return ret;
        };

        this.tick = function () {
            var newx, newy;
            /* move paddle if left control is being clicked */
            if (lfHeld) {
                newx = _shape.x - direction_vec.x() * PADDLE_SPEED;
                newy = _shape.y - direction_vec.y() * PADDLE_SPEED;
                /* bounds check */
                if (newx >= bounds.left.x() && newy >= bounds.left.y()) {
                    _shape.x = newx;
                    _shape.y = newy;
                }
            }
            /* move paddle if right control is being clicked */
            if (rtHeld) {
                newx = _shape.x + direction_vec.x() * PADDLE_SPEED;
                newy = _shape.y + direction_vec.y() * PADDLE_SPEED;
                /* bounds check */
                if (newx <= bounds.right.x() && newy <= bounds.right.y()) {
                    _shape.x = newx;
                    _shape.y = newy;
                }
            }
        };

        this.shape = _shape;

    }




    ///////////////////// Networking //////////////////////
    function updateServer() {
        // fill this in later
        var newstate = null;
        server.set(newstate);
    }

    function onServerUpdate(snapshot) {
        var newstate = snapshot.val();
        // do something with new state
    }

    // var server = new Firebase('https://ymn.firebaseio.com/hexapong');
    // server.limit(10).on('value', onServerUpdate);




    function addPoint(pos, stage) {
        var _shape = new createjs.Shape();
        _shape.graphics.beginFill("blue").drawCircle(0, 0, 2);
        _shape.x = pos.x();
        _shape.y = pos.y();
        stage.addChild(_shape);
    }


    /////////////////////  Game loop and init //////////////////////
    function rotateVectorClockwiseByDegrees(v, deg) {
        deg *= -1; /* we want clockwise */
        var m = Math.sqrt(v.x * v.x + v.y * v.y);
        var prevAngle = Math.atan(v.y / v.x);
        var newAngle = (Math.PI * deg / 180) + prevAngle;
        /* make the y negative due to the coordinate system */
        return {
            x: m * Math.cos(newAngle),
            y: -1 * (m * Math.sin(newAngle))
        };
    }

    function tick(event) {
        paddles.map(function (p) {
            p.tick();
        });
        ball.tick(paddles, arena);
        stage.update();
    }

    /* Holds public properties */
    var p = {};

    p.init = function () {
        if (window.top != window) {
            document.getElementById("header").style.display = "none";
        }

        canvas = document.getElementById('canvas');
        stage = new createjs.Stage(canvas);


        arena = new PongArena();
        stage.addChild(arena.shape);

        ball = new PongBall(Geometry.makeNormalVectorOfAngle(90));
        ball.shape.x = arena.shape.x;
        ball.shape.y = arena.shape.y;
        stage.addChild(ball.shape);

        paddles = Array(6);
        for (var i = 0; i < paddles.length; i++) {
            paddles[i] = new PongPaddle({
                x: 10 + 200 * i,
                y: 10
            }, $V([1, 0]), {
                left: $V([0, 0]),
                right: $V([50, 50])
            });
            stage.addChild(paddles[i].shape);
        }
        paddles[1].shape.x = 380;
        paddles[1].shape.y = 350;
        paddles[1].shape.rotation = -45;
        var ps = paddles[1].getBoundingPoints();
        for (i in ps) {
            addPoint(ps[i], stage);
        }
        window.Geometry = Geometry;


        stage.update();
        ps = arena.getBoundingPoints();
        for (i in ps) {
            addPoint(ps[i], stage);
        }

        //start game timer   
        if (!createjs.Ticker.hasEventListener("tick")) {
            createjs.Ticker.addEventListener("tick", tick);
            createjs.Ticker.setFPS(TARGET_FPS);
        }


        var fpsOut = document.getElementById('fps');
        setInterval(function () {
            fpsOut.innerHTML = createjs.Ticker.getMeasuredFPS().toFixed(1) + "fps";
        }, 1000);

    };

    return p;

}());