var hexapong = (function hexapong() {

    ///////////////////// Declarations of variables and constants //////////////////////
    var e;
    var PADDLE_SPEED = 5,
        PADDLE_DIMS = {
            length: 80,
            width: 10
        },
        BALL_RADIUS = 10,
        TARGET_FPS = 40,
        DEFAULT_BALL_SPEED = 10;

    var KEYCODE_ENTER = 13,
        KEYCODE_SPACE = 32,
        KEYCODE_UP = 38,
        KEYCODE_LEFT = 37,
        KEYCODE_RIGHT = 39,
        KEYCODE_M = 77,
        KEYCODE_N = 78,
        KEYCODE_X = 88,
        KEYCODE_Z = 90;



    var lfHeld = Array(3),
        rtHeld = Array(3);
    var paddles, ball, arena;
    var stage,
        gameState = {
            paddles: {},
            ball: undefined,
            clientId: undefined,
            heartbeat: {}
        };
    var clientId,
        /* map player ids to their last timestamp */
        playerIds = {};
    var accPing = 0,
        pingCnt = 0;



    ///////////////////// Key Handlers //////////////////////
    document.onkeydown = handleKeyDown;
    document.onkeyup = handleKeyUp;

    function handleKeyDown(e) {
        //cross browser issues exist
        if (!e) {
            e = window.event;
        }
        switch (e.keyCode) {
        case KEYCODE_LEFT:
            lfHeld[0] = true;
            return false;
        case KEYCODE_RIGHT:
            rtHeld[0] = true;
            return false;
        case KEYCODE_Z:
            lfHeld[1] = true;
            return false;
        case KEYCODE_X:
            rtHeld[1] = true;
            return false;
        case KEYCODE_N:
            lfHeld[2] = true;
            return false;
        case KEYCODE_M:
            rtHeld[2] = true;
            return false;
        }
    }

    function handleKeyUp(e) {
        //cross browser issues exist
        if (!e) {
            e = window.event;
        }
        switch (e.keyCode) {
        case KEYCODE_LEFT:
            lfHeld[0] = false;
            break;
        case KEYCODE_RIGHT:
            rtHeld[0] = false;
            break;
        case KEYCODE_Z:
            lfHeld[1] = false;
            break;
        case KEYCODE_X:
            rtHeld[1] = false;
            break;
        case KEYCODE_N:
            lfHeld[2] = false;
            break;
        case KEYCODE_M:
            rtHeld[2] = false;
            break;
        }
    }




    ///////////////////// Class Definitions //////////////////////
    var Geometry = {

        rotateVectorClockwiseByDegrees: function (v, deg) {
            deg *= -1; /* we want clockwise */
            var m = Math.sqrt(v.x() * v.x() + v.y() * v.y());
            var prevAngle = Math.atan(v.y() / v.x());
            var newAngle = (Math.PI * deg / 180) + prevAngle;
            /* make the y negative due to the coordinate system */
            return $V([
                m * Math.cos(newAngle),
                -1 * (m * Math.sin(newAngle))
            ]);
        },

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

        getClosestPointToCircle: function (p1, p2, c) {
            var line = p2.subtract(p1);
            var pt = c.subtract(p1);
            var l_unit = line.toUnitVector();
            var proj = pt.dot(l_unit);
            if (proj <= 0) {
                return p1;
            } else if (proj >= line.magnitude()) {
                return p2;
            }
            var proj_v = l_unit.multiply(proj);
            return proj_v.add(p1);
        },

        getMidPoint: function (a, b) {
            return a.add(b).multiply(0.5);
        },


        lineIntersectCircle: function (line, circle) {
            var closestP = Geometry.getClosestPointToCircle(line[0], line[1], circle.center);
            var dist_v = circle.center.subtract(closestP);
            // console.log(dist_v.magnitude());
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
                if (ret) {
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
        _shape.graphics.beginRadialGradientFill(["#FF0", "#0FF"], [0, 1], 0, 0, 0, 0, 0, 200).drawPolyStar(0, 0, 200, 6, 0, -90);
        _shape.x = 480;
        _shape.y = 200;
        var _boundingPoints;

        /**
         * returns true if a point (vector) is inside the game arena
         */
        this.isPointInside = function (p) {
            return Geometry.isPointInsidePolygon(p, _boundingPoints);
        };

        /**
         * returns an array of vectors with each vector being a point of
         * the polygon forming the arena
         */
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


    function PongBall(direction_vec, start_loc) {

        var _speed = DEFAULT_BALL_SPEED;
        var _shape = new createjs.Shape();
        _shape.graphics.beginRadialGradientFill(["#F80", "#F00"], [0.2, 0.8], 0, 0, 0, 0, 0, BALL_RADIUS).drawCircle(0, 0, BALL_RADIUS);
        _shape.x = start_loc.x();
        _shape.y = start_loc.y();

        /**
         * Takes in a rectangle given as an array of 4 points (vectors), and
         * checks whether a collision occurs with the ball. If so, it elastically
         * collides with it accordingly.
         * returns true if it collided, otherwise false
         */
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


        /**
         * restarts the ball in the middle of the arena
         */
        var _reset = function () {
            _shape.x = start_loc.x();
            _shape.y = start_loc.y();
        };

        var _updateBallLoc = function () {
            gameState.ball = {
                loc: $V([_shape.x, _shape.y]),
                dir: direction_vec
            };
            updateServer();
        };

        this.tick = function (paddles, arena) {
            for (var i = 0; i < paddles.length; i++) {
                if (_collideWithPaddle(paddles[i].getBoundingPoints())) {
                    _shape.x += direction_vec.x() * _speed;
                    _shape.y += direction_vec.y() * _speed;
                    /* make sure we get the ball outside of the paddle */
                    while (_collideWithPaddle(paddles[i].getBoundingPoints())) {
                        _shape.x += direction_vec.x() * _speed;
                        _shape.y += direction_vec.y() * _speed;
                    }
                    createjs.Sound.play("bounce", createjs.Sound.INTERUPT_LATE);
                    _updateBallLoc();
                    break;
                }
            }
            if (!arena.isPointInside($V([_shape.x, _shape.y]))) {
                createjs.Sound.play("death", createjs.Sound.INTERRUPT_LATE, 0, 0, 0, 0.2);
                // _updateBallLoc();
                _reset();
            }
            _shape.x += direction_vec.x() * _speed;
            _shape.y += direction_vec.y() * _speed;
        };

        this.shape = _shape;
        this.direction_vec = _shape;
    }


    function PongPaddle(ini_pos, direction_vec, bounds, player_num, index, len) {

        /**
         * we pick either the x-axis or y-axis to keep track of the paddle's
         * bounds. We don't need to do both since we know the direction vector
         * is parallel to the arena
         */
        var X_MAJOR = "x";
        var Y_MAJOR = "y";
        var _majorAxis = Math.abs(direction_vec.x()) > Math.abs(direction_vec.y()) ? X_MAJOR : Y_MAJOR;


        var _shape = new createjs.Shape();
        var _length = PADDLE_DIMS.length;
        if (len !== undefined) _length = len;
        _shape.graphics.beginFill('rgba(255,0,0,1)').drawRect(0, 0, _length, PADDLE_DIMS.width);
        _shape.rotation = Math.atan(direction_vec.y() / direction_vec.x()) * (180 / Math.PI);

        var v = direction_vec.toUnitVector().multiply(_length);
        var _xlen = v.x(); // the paddle's length on the x-axis
        var _ylen = v.y(); // the paddle's length on the y-axis
        /* start the paddle in the middle of its arena edge */
        _shape.x = ini_pos.x() - 0.5 * _xlen;
        _shape.y = ini_pos.y() - 0.5 * _ylen;

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
            var rotated = Geometry.rotateVectorClockwiseByDegrees($V([
                0,
                -1 * PADDLE_DIMS.width
            ]), _shape.rotation);
            ret.bl = $V([_shape.x + rotated.x(),
                _shape.y + rotated.y()
            ]);
            rotated = Geometry.rotateVectorClockwiseByDegrees($V([
                _length,
                -1 * PADDLE_DIMS.width
            ]), _shape.rotation);
            ret.br = $V([_shape.x + rotated.x(),
                _shape.y + rotated.y()
            ]);
            rotated = Geometry.rotateVectorClockwiseByDegrees($V([
                _length,
                0
            ]), _shape.rotation);
            ret.tr = $V([_shape.x + rotated.x(),
                _shape.y + rotated.y()
            ]);
            return ret;
        };

        this.tick = function () {
            var newx, newy, should_move;
            /* move paddle if left control is being clicked */
            if (lfHeld[player_num]) {
                newx = _shape.x - direction_vec.x() * PADDLE_SPEED;
                newy = _shape.y - direction_vec.y() * PADDLE_SPEED;
                /* bounds check */
                if (_majorAxis == X_MAJOR) {
                    should_move = (newx >= bounds.left.x());
                } else {
                    should_move = (newy >= bounds.left.y());
                }
            }
            /* move paddle if right control is being clicked */
            if (rtHeld[player_num]) {
                newx = _shape.x + direction_vec.x() * PADDLE_SPEED;
                newy = _shape.y + direction_vec.y() * PADDLE_SPEED;
                /* bounds check */
                if (_majorAxis == X_MAJOR) {
                    should_move = ((newx + _xlen) <= bounds.right.x());
                } else {
                    should_move = ((newy + _ylen) <= bounds.right.y());
                }
            }
            if (should_move) {
                //console.log(newx + " is bigger than " + bounds.left.x());
                // _shape.x = newx;
                // _shape.y = newy;
                gameState["paddles"][index] = $V([newx, newy]);
                gameState.ball = {};
                updateServer(function(){
                    _shape.x = newx;
                    _shape.y = newy;
                });
            }
        };

        this.shape = _shape;

    }

    function Wall(ini_pos, direction_vec, bounds, player_num, index) {

        var hex_side_len = bounds.left.subtract(bounds.right).magnitude();
        var _paddle = new PongPaddle(ini_pos, direction_vec, bounds, player_num, index, hex_side_len);

        this.tick = function () {};

        this.getBoundingPoints = _paddle.getBoundingPoints;

        this.isWall = true;
        this.shape = _paddle.shape;
        window.shape = _paddle.shape;

    }



    ///////////////////// Networking //////////////////////
    function getUniqueId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0,
                v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function updateServer(onComplete) {
        gameState.clientId = clientId;
        gameState.timeStamp = (new Date()).getTime();
        server.set(gameState, function() {
            // measure ping
            var ping = (new Date()).getTime() - gameState.timeStamp;
            accPing += ping;
            pingCnt++;
            if (pingCnt == 50) {
                accPing = 0;
                pingCnt = 0;
            }

            if(onComplete !== undefined) onComplete();
        });
    }

    function onServerUpdate(snapshot) {
        var newstate = snapshot.val();

        if (newstate.clientId !== clientId) {
            // someone else updated server. update his timestamp so we mark him as active
            playerIds[newstate.clientId] = newstate.timeStamp;
            // for (var i in newstate.paddles) {
            //     var p = paddles[parseInt(i, 10)];
            //     if (p.isWall) continue;
            //     p.shape.x = newstate.paddles[i].elements[0];
            //     p.shape.y = newstate.paddles[i].elements[1];
            // }
        }


        /*
        if (newstate.ball.loc !== undefined) {
            ball.shape.x = newstate.ball.loc.elements[0];
            ball.shape.y = newstate.ball.loc.elements[1];
            ball.direction_vec = $V([newstate.ball.dir.elements[0],
                newstate.ball.dir.elements[1]
            ]);
        }*/
    }

    var server = new Firebase('https://ymn.firebaseio.com/hexapong');
    server.limit(10).on('value', onServerUpdate);




    function addPoint(pos, stage) {
        var _shape = new createjs.Shape();
        _shape.graphics.beginFill("blue").drawCircle(0, 0, 2);
        _shape.x = pos.x();
        _shape.y = pos.y();
        stage.addChild(_shape);
    }


    /////////////////////  Game loop and init //////////////////////
    function updateLoading() {
        //messageField.text = "Loading " + (preload.progress*100|0) + "%"
        console.log("Loading " + (preload.progress * 100 | 0) + "%");
        stage.update();
    }

    function doneLoading(event) {
        // start the music
        createjs.Sound.play("music", createjs.Sound.INTERRUPT_NONE, 0, 0, -1, 0.05);
    }

    function rotateArena(){
        var deg = 1;
        var rad = Math.PI*deg/180;
        arena.shape.rotation += deg;
        for (var i = 0; i < paddles.length; i++) {
            var rotateMe = $V([paddles[i].shape.x, paddles[i].shape.y]);
            var center = $V([arena.shape.x, arena.shape.y]);

            var newx = center.x() + (rotateMe.x()-center.x())*Math.cos(rad) - (rotateMe.y()-center.y())*Math.sin(rad);
            var newy = center.y() + (rotateMe.x()-center.x())*Math.sin(rad) + (rotateMe.y()-center.y())*Math.cos(rad);

            paddles[i].shape.x = newx;
            paddles[i].shape.y = newy;

            paddles[i].shape.rotation += 1;
        }
    }

    function tick(event) {
        paddles.map(function (p) {
            p.tick();
        });
        ball.tick(paddles, arena);
        stage.update();
        rotateArena();
    }

    /* Holds public properties */
    var p = {};

    p.init = function () {
        if (window.top != window) {
            document.getElementById("header").style.display = "none";
        }

        if (!createjs.Sound.initializeDefaultPlugins()) {
            console.log("we've got sound problems");
            return;
        }

        clientId = getUniqueId();
        canvas = document.getElementById('canvas');
        stage = new createjs.Stage(canvas);


        /* first create the arena */
        arena = new PongArena();
        stage.addChild(arena.shape);

        /* now add the ball */
        ball = new PongBall(Geometry.makeNormalVectorOfAngle(360 * Math.random()),
            $V([arena.shape.x, arena.shape.y]));
        stage.addChild(ball.shape);


        stage.update();
        /* testing */
        var arenaPoints = arena.getBoundingPoints();
        // for (var i in arenaPoints) {
        //     addPoint(arenaPoints[i], stage);
        // }

        var wallPositions = Array(6);
        wallPositions[1] = true;
        wallPositions[4] = true;

        /* create the paddles */
        paddles = Array(6);
        for (var i = 0; i < paddles.length; i++) {

            /* making p1 and p2 consistent by x-coordinate makes life easier */
            var p1 = arenaPoints[i];
            var p2 = arenaPoints[(i + 1) % arenaPoints.length];
            if (p2.x() < p1.x()) {
                var t = p2;
                p2 = p1;
                p1 = t;
            }

            /* place the paddle in the middle of the edge, and give it its two endpoints */
            if (wallPositions[i]) {
                paddles[i] = new Wall(Geometry.getMidPoint(p1, p2),
                    p2.subtract(p1).toUnitVector(), {
                        left: p1,
                        right: p2
                    }, i % 3, i);
            } else {
                paddles[i] = new PongPaddle(Geometry.getMidPoint(p1, p2),
                    p2.subtract(p1).toUnitVector(), {
                        left: p1,
                        right: p2
                    }, i % 3, i);
            }

            stage.addChild(paddles[i].shape);
        }



        //start game timer   
        if (!createjs.Ticker.hasEventListener("tick")) {
            createjs.Ticker.addEventListener("tick", tick);
            createjs.Ticker.setFPS(TARGET_FPS);
        }

        var fpsOut = document.getElementById('fps'),
            pingOut = document.getElementById('ping'),
            activePlayersOut = document.getElementById('active-players');
        setInterval(function () {
            fpsOut.innerHTML = createjs.Ticker.getMeasuredFPS().toFixed(1) + " fps";
            pingOut.innerHTML = (accPing / pingCnt).toFixed(1) + " ping";
            var curTime = (new Date()).getTime();
            for (var p in playerIds) {
                if (curTime - playerIds[p] > 3000) {
                    // remove this inactive player
                    delete(playerIds[p]);
                }
            }
            activePlayersOut.innerHTML = Object.keys(playerIds).length + " other active players.";
        }, 1000);

        // begin loading content (only sounds to load)
        var manifest = [{
            id: "music",
            src: "assets/music.mp3"
        }, {
            id: "bounce",
            src: "assets/bounce.mp3"
        }, {
            id: "death",
            src: "assets/death.mp3"
        }];

        preload = new createjs.LoadQueue();
        preload.installPlugin(createjs.Sound);
        preload.addEventListener("complete", doneLoading); // add an event listener for when load is completed
        preload.addEventListener("progress", updateLoading);
        preload.loadManifest(manifest);
    };

    return p;

}());