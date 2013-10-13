var hexapong = (function hexapong() {

    ///////////////////// Declarations of variables and constants //////////////////////
    var PADDLE_SPEED = 4,
        PADDLE_DIMS = {
            length: 120,
            width: 10
        },
        BALL_RADIUS = 10;

    var KEYCODE_ENTER = 13,
        KEYCODE_SPACE = 32,
        KEYCODE_UP = 38,
        KEYCODE_LEFT = 37,
        KEYCODE_RIGHT = 39,
        KEYCODE_W = 87,
        KEYCODE_A = 65,
        KEYCODE_D = 68;


    var lfHeld, rtHeld;
    var paddles, ball;
    var stage;



    ///////////////////// Key Handlers //////////////////////
    document.onkeydown = handleKeyDown;
    document.onkeyup = handleKeyUp;

    function handleKeyDown(e) {
        //cross browser issues exist
        if (!e) {
            var e = window.event;
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
            var e = window.event;
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
    function PongBall(direction_vec) {

        var _speed = 5;
        var _shape = new createjs.Shape();
        _shape.graphics.beginFill("red").drawCircle(0, 0, BALL_RADIUS);

        this.tick = function () {
            _shape.x += direction_vec.x * _speed;
            _shape.y += direction_vec.y * _speed;
        };

        this.shape = _shape;
    }


    function PongPaddle(ini_pos, direction_vec, bounds) {

        var _shape = new createjs.Shape();
        _shape.graphics.beginFill('rgba(255,0,0,1)').drawRect(ini_pos.x, ini_pos.y, PADDLE_DIMS.length, PADDLE_DIMS.width);
        _shape.rotation = Math.atan(direction_vec.y / direction_vec.x) * (180 / Math.PI);

        this.tick = function () {
            var newx, newy;
            if (lfHeld) {
                newx = _shape.x - direction_vec.x * PADDLE_SPEED;
                newy = _shape.y - direction_vec.y * PADDLE_SPEED;
                if (newx >= bounds.left.x && newy >= bounds.left.y) {
                    _shape.x = newx;
                    _shape.y = newy;
                }
            }
            if (rtHeld) {
                newx = _shape.x + direction_vec.x * PADDLE_SPEED;
                newy = _shape.y + direction_vec.y * PADDLE_SPEED;
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

    var server = new Firebase('https://ymn.firebaseio.com/hexapong');
    server.limit(10).on('value', onServerUpdate);




    /////////////////////  Game loop and init //////////////////////
    function tick(event) {
        paddles.map(function (p) {
            p.tick();
        });
        ball.tick();
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

        ball = new PongBall({
            x: 1,
            y: 1
        });
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

        stage.update();

        //start game timer   
        if (!createjs.Ticker.hasEventListener("tick")) {
            createjs.Ticker.addEventListener("tick", tick);
        }

    };

    return p;

}());