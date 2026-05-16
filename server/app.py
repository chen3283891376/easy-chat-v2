from flask import Flask, request, jsonify
import pickle

app = Flask(__name__)
variables = {}

try:
    with open("var.pickle","rb") as f:
        variables = pickle.load(f)
except:
    with open("var.pickle","wb") as f:
        variables = {}
        pickle.dump({},f)

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
    global variables
    key = request.args.get('key')
    if key in variables:
        return jsonify({"status": "success", "message": "操作成功", "data": variables[key]})
    else:
        return jsonify({"status": "error", "message": "云变量未找到", "data": []}), 404

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=58060, debug=True)