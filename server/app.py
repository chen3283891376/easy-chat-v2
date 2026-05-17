from flask import Flask, request, jsonify
import pickle

app = Flask(__name__)
variables = {}
public_keys = {}
user_data = {}

try:
    with open("var.pickle","rb") as f:
        variables = pickle.load(f)
except:
    with open("var.pickle","wb") as f:
        variables = {}

try:
    with open("public_keys.pickle","rb") as f:
        public_keys = pickle.load(f)
except:
    with open("public_keys.pickle","wb") as f:
        public_keys = {}

try:
    with open("user_info.pickle","rb") as f:
        user_data = pickle.load(f)
except:
    with open("user_info.pickle","wb") as f:
        user_data = {}

@app.route('/new', methods=['POST'])
def new_variable():
    key = request.json['key']
    value = request.json['value']
    if key in variables:
        return jsonify({"status": "error","message": "云变量已存在","data" : []})
    else:
        variables[key] = value
        with open("var.pickle","wb") as f:
            pickle.dump(variables,f)
        return jsonify({"status": "success", "message": f"云变量 {key} 成功创建并设为 {value}", "data": []})

@app.route('/set', methods=['POST'])
def set_variable():
    key = request.json['key']
    value = request.json['value']
    if key in variables:
        variables[key] = value
        with open("var.pickle","wb") as f:
            pickle.dump(variables,f)
        return jsonify({"status": "success", "message": f"云变量 {key} 成功设为 {value}", "data": []})
    else:
        return jsonify({"status": "error", "message": "云变量不存在", "data": []}), 404

@app.route('/get', methods=['GET'])
def get_variable():
    key = request.args.get('key')
    if key in variables:
        return jsonify({"status": "success", "message": "操作成功", "data": variables[key]})
    else:
        return jsonify({"status": "error", "message": "云变量未找到", "data": []}), 404

@app.route('/auth/register', methods=['POST'])
def register():
    info = request.json
    uname = info.get("username")
    pub_key = info.get("publicKey")
    enc_pri = info.get("encryptedPrivate")

    if not uname or not pub_key:
        return jsonify({"status":"error","message":"参数不全"})
    if uname in user_data:
        return jsonify({"status":"error","message":"用户名已被注册"})
    
    user_data[uname] = {
        "publicKey": pub_key,
        "encryptedPrivate": enc_pri
    }
    with open("user_info.pickle","wb") as f:
        pickle.dump(user_data, f)
    return jsonify({"status":"success","message":"注册完成"})

@app.route('/auth/login', methods=['POST'])
def login():
    info = request.json
    uname = info.get("username")
    if uname not in user_data:
        return jsonify({"status":"error","message":"用户不存在"})
    return jsonify({
        "status":"success",
        "data": user_data[uname]
    })

@app.route('/user/publickey/<username>', methods=['GET'])
def get_user_pubkey(username):
    if username not in user_data:
        return jsonify({"status":"error","message":"无此用户"})
    return jsonify({
        "status":"success",
        "message":"操作成功",
        "data": user_data[username]["publicKey"]
    })

# ========== 批量获取所有公钥 ==========
@app.route('/user/public-keys', methods=['GET'])
def get_all_public_keys():
    result = {}
    for uname, info in user_data.items():
        result[uname] = info["publicKey"]
    return jsonify({"status":"success","data":result})

@app.route('/user/publickey', methods=['GET'])
def get_public_key():
    return jsonify({"status": "success", "message": "操作成功", "data": "public_key_here"})

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=58060, debug=True)