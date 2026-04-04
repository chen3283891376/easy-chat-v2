import flask, peewee
app = flask.Flask(__name__)

db = peewee.SqliteDatabase('easy-chat.db')
class Room(peewee.Model):
    room_id = peewee.IntegerField()
    name = peewee.CharField()
    messages = peewee.TextField()

    class Meta:
        database = db
db.connect()
db.create_tables([Room])

@app.route('/api/room/<room_id>', methods=['GET'])
def get_room(room_id):
    room = Room.get_or_none(Room.room_id == room_id)
    if room is None:
        return 'Room not found', 404
    return flask.jsonify({
        'name': room.name,
        'messages': room.messages
    })
@app.route('/api/room/<room_id>/save', methods=['POST'])
def save_room(room_id):
    room = Room.get_or_none(Room.room_id == room_id)
    if room is None:
        return 'Room not found', 404
    data = flask.request.get_json()
    messages = data.get('messages')
    if messages is None:
        return 'Missing messages', 400
    room.messages = messages
    room.save()
    return 'Messages saved', 200
@app.route('/api/room', methods=['POST'])
def create_room():
    data = flask.request.get_json()
    room_id = data.get('room_id')
    name = data.get('name')
    if room_id is None or name is None:
        return 'Missing room_id or name', 400
    if Room.get_or_none(Room.room_id == room_id) is not None:
        return 'Room already exists', 400
    Room.create(room_id=room_id, name=name, messages='[]')
    return 'Room created', 201

app.run(debug=True)