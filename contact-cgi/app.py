# -*- coding: utf-8 -*-
"""
お問い合わせフォーム用の公開API。CGI(index.cgi)経由でこのFlaskアプリが起動する。
admin-cgi（推測されにくいURLの管理画面）とは別物で、こちらは誰でもアクセスできる
公開の窓口。認証は無い代わりに、信号機クイズ＋ハニーポットでボット投稿を弾く。

このファイルの置き場所: www/contact/api/app.py
データの置き場所:      www/data/contact_submissions.json
"""
import base64
import hashlib
import hmac
import json
import os
import random
import subprocess
import time
from datetime import datetime, timezone
from email.header import Header
from email.mime.text import MIMEText

from flask import Flask, jsonify, request

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# api/app.py から見て www/ は2階層上（www/contact/api/app.py）。
# OSUSUME_WWW_DIR を設定すればローカル検証時に任意のフォルダへ差し替えられる。
WWW_DIR = os.environ.get('OSUSUME_WWW_DIR') or os.path.abspath(os.path.join(BASE_DIR, '..', '..'))

# 問い合わせ内容（氏名・メールアドレス・本文）は個人情報なので、
# 誰でも見られる www/ 配下には絶対に置かない。www/ の一つ上、Webから
# 到達できない場所に保存する。OSUSUME_PRIVATE_DIR でローカル検証時に差し替え可能。
PRIVATE_DIR = os.environ.get('OSUSUME_PRIVATE_DIR') or os.path.abspath(os.path.join(WWW_DIR, '..', 'private-data'))
DATA_FILE = os.path.join(PRIVATE_DIR, 'contact_submissions.json')

TO_ADDRESS = 'moutineigo@gmail.com'
FROM_ADDRESS = 'eigo@eigo55.sakura.ne.jp'

QUESTIONS = [
    ('信号機で「とまれ」を意味する色を選んでください', 'red'),
    ('信号機で「ちゅうい」を意味する色を選んでください', 'yellow'),
    ('信号機で「すすめ」を意味する色を選んでください', 'green'),
]


def _load_captcha_secret():
    """
    リポジトリは公開なので、このシークレットは絶対にコードへ直書きしない。
    本番: 環境変数 CONTACT_CAPTCHA_SECRET、またはデプロイ時にサーバー上へ直接書き込む
          captcha_secret.txt（どちらもgit管理外）から読む。
    ローカル検証用にフォールバック値を用意しているが、本番では必ず上記のどちらかを設定すること。
    """
    env_val = os.environ.get('CONTACT_CAPTCHA_SECRET')
    if env_val:
        return env_val.encode('utf-8')
    secret_file = os.path.join(BASE_DIR, 'captcha_secret.txt')
    if os.path.exists(secret_file):
        with open(secret_file, 'r', encoding='utf-8') as f:
            val = f.read().strip()
            if val:
                return val.encode('utf-8')
    return b'local-dev-only-insecure-fallback-secret'


CAPTCHA_SECRET = _load_captcha_secret()


@app.after_request
def add_cors_headers(resp):
    resp.headers['Access-Control-Allow-Origin'] = '*'
    resp.headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS'
    resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return resp


def make_token(answer):
    payload = json.dumps({'a': answer, 't': int(time.time())}, separators=(',', ':')).encode('utf-8')
    payload_b64 = base64.urlsafe_b64encode(payload).decode('ascii')
    sig = hmac.new(CAPTCHA_SECRET, payload_b64.encode('ascii'), hashlib.sha256).hexdigest()
    return f'{payload_b64}.{sig}'


def verify_token(token, submitted_answer):
    """
    署名とタイムスタンプを検証する。早すぎる送信（Botによる即時送信）や
    古すぎるトークン（使い回し）は弾く。
    """
    try:
        payload_b64, sig = (token or '').split('.', 1)
    except ValueError:
        return False
    expected_sig = hmac.new(CAPTCHA_SECRET, payload_b64.encode('ascii'), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected_sig, sig):
        return False
    try:
        payload = json.loads(base64.urlsafe_b64decode(payload_b64.encode('ascii')))
    except Exception:
        return False
    issued_at = payload.get('t', 0)
    now = time.time()
    if now - issued_at < 1.5:
        return False
    if now - issued_at > 1800:
        return False
    return payload.get('a') == submitted_answer


@app.route('/challenge', methods=['GET', 'OPTIONS'])
def challenge():
    if request.method == 'OPTIONS':
        return '', 204
    question, answer = random.choice(QUESTIONS)
    return jsonify({'question': question, 'token': make_token(answer)})


def send_mail(name, email_addr, message):
    subject = f'【おすすめマップ】お問い合わせ: {name}'
    body = f'お名前: {name}\nメールアドレス: {email_addr}\n\n--- 内容 ---\n{message}\n'
    msg = MIMEText(body, _charset='utf-8')
    msg['Subject'] = Header(subject, 'utf-8')
    msg['From'] = FROM_ADDRESS
    msg['To'] = TO_ADDRESS
    msg['Reply-To'] = email_addr
    try:
        # -f でエンベロープFrom（SMTPのMAIL FROM）も明示的にFROM_ADDRESSへ揃える。
        # 指定しないとこのサーバーはエンベロープFromを別のアドレス
        # (アカウント名@サーバーの共用ホスト名) に自動で書き換えてしまい、
        # ヘッダーのFrom:と食い違うためGmail側で無言で捨てられていた（実際に発生した不具合）。
        proc = subprocess.run(
            ['/usr/sbin/sendmail', '-t', '-i', '-f', FROM_ADDRESS],
            input=msg.as_bytes(),
            capture_output=True,
            timeout=10
        )
        return proc.returncode == 0
    except Exception:
        return False


def log_submission(name, email_addr, message, mail_sent):
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    entries = []
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, 'r', encoding='utf-8') as f:
                entries = json.load(f)
        except Exception:
            entries = []
    entries.append({
        'name': name,
        'email': email_addr,
        'message': message,
        'receivedAt': datetime.now(timezone.utc).isoformat(),
        'mailSent': mail_sent
    })
    tmp_path = DATA_FILE + '.tmp'
    with open(tmp_path, 'w', encoding='utf-8') as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)
        f.write('\n')
    os.replace(tmp_path, DATA_FILE)


@app.route('/submit', methods=['POST', 'OPTIONS'])
def submit():
    if request.method == 'OPTIONS':
        return '', 204

    name = (request.form.get('name') or '').strip()
    email_addr = (request.form.get('email') or '').strip()
    message = (request.form.get('message') or '').strip()
    honeypot = (request.form.get('website') or '').strip()
    answer = (request.form.get('answer') or '').strip()
    token = request.form.get('token') or ''

    if honeypot:
        # ボット判定。人間には見えない項目が埋まっている＝ボット。
        # 気づかれないよう成功したフリをして返すだけで、メール送信・記録はしない。
        return jsonify({'ok': True})

    if not name or not email_addr:
        return jsonify({'error': 'お名前とメールアドレスは必須です'}), 400
    if '@' not in email_addr or '.' not in email_addr.split('@')[-1]:
        return jsonify({'error': 'メールアドレスの形式が正しくありません'}), 400

    if not verify_token(token, answer):
        return jsonify({'error': '認証に失敗しました。もう一度お試しください'}), 400

    mail_sent = send_mail(name, email_addr, message)
    log_submission(name, email_addr, message, mail_sent)

    return jsonify({'ok': True})


if __name__ == '__main__':
    # ローカル検証専用（本番はCGI経由で動く）
    app.run(port=5177, debug=True)
