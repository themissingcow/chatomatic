var fs = require('fs');
var https = require('https');

//
// App/Server
//

// To generate dev ssl keys:
//
//   mkdir ./ssl && cd ./ssl
//   openssl req -x509 \
//     -out localhost.crt \
//     -keyout localhost.key \
//     -newkey rsa:2048 -nodes -sha256 \
//     -subj '/CN=localhost' \
//     -extensions EXT -config <( \
//      printf "[dn]\nCN=localhost\n[req]\ndistinguished_name = dn\n[EXT]\nsubjectAltName=DNS:localhost\nkeyUsage=digitalSignature\nextendedKeyUsage=serverAuth")

var app = require('express')();

var serverOptions = {
	key: fs.readFileSync( process.env.SSL_KEY || (__dirname + '/ssl/localhost.key') ),
	cert: fs.readFileSync( process.env.SSL_CRT || (__dirname + '/ssl/localhost.crt') ),
	rejectUnauthorized: false
};

if ( process.env.NODE_ENV != "development" ) {
	serverOptions['ca'] =  fs.readFileSync(process.env.SSL_PDT_CA)
};

server = https.createServer(serverOptions, app);

// Client page

app.get('/', function(req, res) {
    res.sendFile(__dirname + '/index.html');
});

//
// Socket IO
//

io = require('socket.io')(server);


history = {};


function roomUsers(room) {
    names = []
    connected = io.sockets.in(room).connected
    for(var h in connected) {
        names.push(connected[h].name);
    }
    names.sort();
    return names;
}


function postMessage(socket, data, toAll) {

    if (!socket.room || !socket.name) { return; }

    const room = socket.room;

    if (!history[room]) {
        history[room] = [];
    }

    message = {
        name: socket.name,
        body: data.body,
        type: data.type || 'message',
        at: new Date()
    }

    history[room].push(message);

    if (toAll) {
        io.sockets.in(room).emit('message', message);
    } else {
        socket.broadcast.to(room).emit('message', message);
    }

   // TODO: Some more sensible history management
    if (history[room].lengtr > 100) {
        old = history[room]
        history[room] = old.slice(old.length-50, 50);
    }
}


io.on('connection', function(socket) {

    socket.on('login', function({name, room}) {

        socket.name = name;
        socket.room = room;

        socket.join(room);

        if (history[room ]) {
            socket.emit('messages', history[room]);
        }

        joinMessage = {
            body: `${name} joined`,
            type: 'info'
        }
        postMessage(socket, joinMessage, false);

        io.sockets.in(room).emit('users', roomUsers(room));
    });


    socket.on('disconnect', function() {

        leaveMessage = {
            body: `${socket.name} left`,
            type: 'info'
        }

        postMessage(socket, leaveMessage, false);
        io.sockets.in(socket.room).emit('users', roomUsers(socket.room));
    });

    socket.on('message', data => postMessage(socket, data, true));
});

//
// Listen
//

server.listen(process.env.PORT || 3000)
