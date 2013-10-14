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
                var x = a.elements[0] * b.elements[1] - a.elements[1] * b.elements[0];
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

        /**
         * Circle-rectangle collision detection
         */
        isCircleCollidingWithRect: function (poi, rect) {

            //rectangle edges: TL (top left), TR (top right), BL (bottom left), BR (bottom right)
            var edges = [
                [rect.tl, rect.tr],
                [rect.tl, rect.bl],
                [rect.bl, rect.br],
                [rect.tr, rect.br]
            ];
            var colliding = true;
            var collidingEdge = null;
            for (var i = 0; i < edges.length; i++) {
                var edge = edges[i];
                var d = edge[0].subtract(edge[1]);
                var innerProd = d.dot(poi);
                var intervalMin = Math.min(d.dot(edge[0]), d.dot(edge[1]));
                var intervalMax = Math.max(d.dot(edge[0]), d.dot(edge[1]));
                if (!(intervalMin <= innerProd && innerProd <= intervalMax)) {
                    colliding = false;
                    collidingEdge = d;
                    break;
                }
            }

            return collidingEdge;
        },

        /**
         *  Returns a normal vector rotated clockwise by n degrees
         */
        makeNormalVectorOfAngle: function (degrees) {
            var rad = Math.PI * degrees / 180;
            return $V([Math.cos(rad), Math.sin(rad)]);
        },

        getUnitNormalVectorFromEdge: function (edge) {
            return $V([-1 * edge.elements[1], edge.elements[0]]).toUnitVector();
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
            var collidingEdge = Geometry.isCircleCollidingWithRect($V([_shape.x, _shape.y]), rect);

            if (collidingEdge !== null) {
                direction_vec = Geometry.calculateVectorOfReflection(direction_vec,
                    Geometry.getUnitNormalVectorFromEdge(collidingEdge));
                return true;
            }
            return false;
        };

        this.tick = function (paddles, arena) {
            for (var i = 0; i < paddles.length; i++) {
                if (_collideWithPaddle(paddles[i].getBoundingPoints())) {
                    console.log("Colliding with paddle " + i);
                    _shape.x += direction_vec.elements[0] * _speed;
                    _shape.y += direction_vec.elements[1] * _speed;
                    /* while (_collideWithPaddle(paddles[i].getBoundingPoints())) {
                        _shape.x += direction_vec.elements[0] * _speed;
                        _shape.y += direction_vec.elements[1] * _speed;
                   }*/
                }
                break;
            }
            if (!arena.isPointInside($V([_shape.x, _shape.y]))) {
                _shape.x = 0;
            }
            _shape.x += direction_vec.elements[0] * _speed;
            _shape.y += direction_vec.elements[1] * _speed;
        };

        this.shape = _shape;
    }


    function PongPaddle(ini_pos, direction_vec, bounds) {

        var _shape = new createjs.Shape();
        _shape.graphics.beginFill('rgba(255,0,0,1)').drawRect(0, 0, PADDLE_DIMS.length, PADDLE_DIMS.width);
        _shape.rotation = Math.atan(direction_vec.y / direction_vec.x) * (180 / Math.PI);
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
            ret.bl = $V([paddles[1].shape.x + rotated.x,
                paddles[1].shape.y + rotated.y
            ]);
            rotated = rotateVectorClockwiseByDegrees({
                x: PADDLE_DIMS.length,
                y: -1 * PADDLE_DIMS.width
            }, _shape.rotation);
            ret.br = $V([paddles[1].shape.x + rotated.x,
                paddles[1].shape.y + rotated.y
            ]);
            rotated = rotateVectorClockwiseByDegrees({
                x: PADDLE_DIMS.length,
                y: 0
            }, _shape.rotation);
            ret.tr = $V([paddles[1].shape.x + rotated.x,
                paddles[1].shape.y + rotated.y
            ]);
            return ret;
        };

        this.tick = function () {
            var newx, newy;
            /* move paddle if left control is being clicked */
            if (lfHeld) {
                newx = _shape.x - direction_vec.elements[0] * PADDLE_SPEED;
                newy = _shape.y - direction_vec.elements[1] * PADDLE_SPEED;
                /* bounds check */
                if (newx >= bounds.left.x && newy >= bounds.left.y) {
                    _shape.x = newx;
                    _shape.y = newy;
                }
            }
            /* move paddle if right control is being clicked */
            if (rtHeld) {
                newx = _shape.x + direction_vec.elements[0] * PADDLE_SPEED;
                newy = _shape.y + direction_vec.elements[1] * PADDLE_SPEED;
                /* bounds check */
                if (newx <= bounds.right.x && newy <= bounds.right.y) {
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
        _shape.x = pos.elements[0];
        _shape.y = pos.elements[1];
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

        ball = new PongBall(Geometry.makeNormalVectorOfAngle(45));
        ball.shape.x = arena.shape.x;
        ball.shape.y = arena.shape.y;
        stage.addChild(ball.shape);

        paddles = Array(6);
        for (var i = 0; i < paddles.length; i++) {
            paddles[i] = new PongPaddle({
                x: 10 + 200 * i,
                y: 10
            }, {
                x: 1,
                y: 0
            }, {
                left: {
                    x: 0,
                    y: 0
                },
                right: {
                    x: 50,
                    y: 50
                }
            });
            stage.addChild(paddles[i].shape);
        }
        paddles[1].shape.x = 555;
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