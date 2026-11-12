#!/usr/bin/env python3
"""SmartInsole real-ESP32 USB serial -> local SSE dashboard bridge.
Standard-library HTTP server; only external dependency is pyserial.
Default: real hardware only. --replay is an explicitly labelled testing mode.
"""
import argparse, csv, io, json, os, socket, sys, threading, time, webbrowser
from collections import deque
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

try:
    import serial
    from serial.tools import list_ports
    HAVE_PYSERIAL=True
except ImportError:
    serial=None
    HAVE_PYSERIAL=False
    # macOS/Linux can open serial USB ports without installing a package.
    if os.name=='posix':
        import glob, select, termios, tty
    else:
        print('Windows needs pyserial: run python -m pip install pyserial')
        sys.exit(2)

class PosixSerial:
    """Minimal 115200 8N1 newline reader for Mac/Linux if pyserial is absent."""
    def __init__(self,path,baud,timeout=1):
        self.path=path;self.timeout=timeout;self.fd=os.open(path,os.O_RDWR|os.O_NOCTTY|os.O_NONBLOCK)
        tty.setraw(self.fd)
        attr=termios.tcgetattr(self.fd)
        rate=getattr(termios,'B'+str(baud),None)
        if rate is None:raise ValueError('Unsupported serial baud '+str(baud))
        attr[4]=rate;attr[5]=rate
        attr[2] &= ~termios.PARENB
        attr[2] &= ~termios.CSTOPB
        attr[2] &= ~termios.CSIZE
        attr[2] |= termios.CS8|termios.CLOCAL|termios.CREAD
        termios.tcsetattr(self.fd,termios.TCSANOW,attr)
        self.buffer=b''
    def __enter__(self):return self
    def __exit__(self,*a):os.close(self.fd)
    def readline(self):
        deadline=time.monotonic()+self.timeout
        while True:
            if b'\n' in self.buffer:
                line,self.buffer=self.buffer.split(b'\n',1)
                return line+b'\n'
            t=deadline-time.monotonic()
            if t<=0:return b''
            r,_,_=select.select([self.fd],[],[],t)
            if r:
                try:chunk=os.read(self.fd,4096)
                except BlockingIOError:chunk=b''
                self.buffer+=chunk
                if len(self.buffer)>8192:self.buffer=self.buffer[-4096:]


ROOT=Path(__file__).resolve().parent
FIELDS=['time_s','heel','midfoot','toe','ax','ay','az','gx','gy','gz']
class State:
    def __init__(self,port=None,baud=115200,replay=None):
        self.lock=threading.RLock(); self.port=port; self.baud=baud; self.replay=replay
        self.active_port=None; self.connected=False; self.error='Waiting for ESP32 USB connection'
        self.samples=deque(maxlen=20000); self.seq=0; self.bad=0; self.all_count=0
        self.last_line=''; self.last_seen=0; self.started=time.monotonic(); self.reconnect=threading.Event()
        self.source='REPLAY' if replay else 'HARDWARE'
    def packet(self):
        with self.lock:
            age=round(time.monotonic()-self.last_seen,1) if self.last_seen else None
            return {'connected':bool(self.connected and age is not None and age<3),
                    'port':self.active_port,'requested_port':self.port,
                    'source':self.source,'baud':self.baud,'count':self.all_count,
                    'bad':self.bad,'last_age_s':age,'last_line':self.last_line[-160:],
                    'error':self.error,'seq':self.seq}
    def add(self,raw,frame):
        with self.lock:
            self.seq+=1; self.all_count+=1; frame['seq']=self.seq
            frame['t']=round(time.monotonic()-self.started,4)
            frame['source']=self.source
            self.samples.append(frame); self.last_seen=time.monotonic(); self.last_line=raw[:160]
            self.connected=True; self.error=''
    def frames_since(self,seq):
        with self.lock:
            # Prevent excessive batches after reconnect; send the most recent 200 frames.
            return [x for x in list(self.samples)[-200:] if x['seq']>seq]

ARGS=argparse.ArgumentParser(description='Start SmartInsole ESP32 real-time bridge and dashboard.')
ARGS.add_argument('--port',default=None,help='Actual serial port, e.g. /dev/cu.usbserial-A5069RR4')
ARGS.add_argument('--baud',type=int,default=115200)
ARGS.add_argument('--http-port',type=int,default=8765)
ARGS.add_argument('--no-browser',action='store_true')
ARGS.add_argument('--replay',default=None,help='TEST ONLY: replay recorded CSV, clearly labelled REPLAY')
args=ARGS.parse_args()
st=State(args.port,args.baud,args.replay)

def ports():
    allports=[]
    if HAVE_PYSERIAL:
        for p in list_ports.comports():
            allports.append({'device':p.device,'description':p.description or '', 'hwid':p.hwid or ''})
    else:
        for pattern in ('/dev/cu.usb*','/dev/cu.SLAB*','/dev/cu.wch*','/dev/ttyUSB*','/dev/ttyACM*'):
            for path in glob.glob(pattern):allports.append({'device':path,'description':'USB serial port','hwid':''})
    return allports

def choose_port():
    if st.port:return st.port
    p=ports()
    usb=[x for x in p if ('usb' in (x['device']+' '+x['description']).lower() or 'slab' in x['device'].lower() or 'wch' in x['description'].lower()) and 'bluetooth' not in x['device'].lower()]
    if len(usb)==1:return usb[0]['device']
    # Prefer the known user device, but only when visible.
    known=[x for x in usb if 'A5069RR4' in x['device']]
    if known:return known[0]['device']
    if len(usb)>1:
        with st.lock:st.error='Multiple USB ports detected. Select the ESP32 port in the dashboard.'
    return None

def parse_row(raw):
    """User's observed 10-column timestamp+FSR+IMU rows; legacy 14-column firmware."""
    raw=raw.strip()
    if not raw or raw[0] not in '-0123456789{':return None
    try:
        if raw.startswith('{'):
            j=json.loads(raw); q=j.get('sensors',j)
            vals=[float(q[k]) for k in ['heel','midfoot','toe','ax','ay','az','gx','gy','gz']]
            devt=float(q.get('time_s',q.get('t',0)))
        else:
            a=[s.strip() for s in raw.split(',')]
            if len(a)==10:
                devt=float(a[0]); vals=[float(v) for v in a[1:10]]
            elif len(a)>=14:
                devt=None; vals=[float(v) for v in a[:9]]
            else:return None
        if not all(abs(v)<1e9 and v==v for v in vals):return None
        if not all(0<=v<=4095 for v in vals[:3]):return None
        f={k:round(vals[i],4) for i,k in enumerate(FIELDS[1:])}
        f['device_time_s']=devt
        return f
    except (ValueError,KeyError,TypeError,IndexError,json.JSONDecodeError):return None

def replay_worker(path):
    while True:
        try:
            with open(path,encoding='utf-8-sig') as f:
                reader=csv.DictReader(f)
                base=None;prev=0
                with st.lock:st.active_port='SYNTHETIC REPLAY';st.error='TEST REPLAY — NOT ESP32 HARDWARE'
                for x in reader:
                    # Synthetic data must never be mistaken for hardware.
                    try:
                        raw=','.join(x.get(k,'') for k in FIELDS)
                        frame=parse_row(raw)
                        if frame:
                            t=float(x.get('time_s',0));
                            if base is None:base=t
                            delay=max(0,min(.2,t-prev)) if prev else .025
                            time.sleep(delay); prev=t;st.add(raw,frame)
                    except (TypeError,ValueError):pass
            time.sleep(1)
        except Exception as e:
            with st.lock:st.connected=False;st.error=f'Replay failed: {e}'
            time.sleep(3)

def serial_worker():
    while True:
        requested=choose_port()
        if not requested:
            with st.lock:st.connected=False;st.active_port=None
            time.sleep(1.25);continue
        try:
            with (serial.Serial(requested,st.baud,timeout=1) if HAVE_PYSERIAL else PosixSerial(requested,st.baud,timeout=1)) as device:
                with st.lock:
                    st.active_port=requested;st.error='Port open: waiting for numeric sensor lines';st.connected=False
                print(f'[ESP32] Opened {requested} at {st.baud} baud',flush=True)
                st.reconnect.clear()
                while not st.reconnect.is_set():
                    raw=device.readline().decode('utf-8','replace').strip()
                    if not raw:continue
                    frame=parse_row(raw)
                    if frame is not None:st.add(raw,frame)
                    else:
                        with st.lock:st.bad+=1;st.last_line=raw[-160:]
        except (Exception,) as e:
            with st.lock:st.error=str(e)
            print('[ESP32] Waiting/retrying: '+str(e),flush=True)
        finally:
            with st.lock:st.connected=False;st.active_port=None
        time.sleep(1.25)

class Handler(SimpleHTTPRequestHandler):
    protocol_version='HTTP/1.1'
    def __init__(self,*a,**k):super().__init__(*a,directory=str(ROOT),**k)
    def log_message(self,fmt,*args):
        if '/api/stream' not in str(args):super().log_message(fmt,*args)
    def jsonreply(self,obj,status=200):
        body=json.dumps(obj,allow_nan=False).encode()
        self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body)
    def do_GET(self):
        path=urlparse(self.path).path
        if path=='/api/health':return self.jsonreply({'ok':True,**st.packet()})
        if path=='/api/ports':return self.jsonreply({'ports':ports(),**st.packet()})
        if path=='/api/live.csv':
            with st.lock:rows=list(st.samples)
            output=io.StringIO();writer=csv.writer(output);writer.writerow(FIELDS)
            for f in rows:writer.writerow([f['t']]+[f[k] for k in FIELDS[1:]])
            body=output.getvalue().encode('utf-8')
            self.send_response(200);self.send_header('Content-Type','text/csv; charset=utf-8')
            self.send_header('Content-Disposition','attachment; filename="SmartInsole_Live_ESP32.csv"')
            self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body);return
        if path=='/api/stream':return self.sse()
        return super().do_GET()
    def do_POST(self):
        path=urlparse(self.path).path
        if path not in ['/api/port','/api/reset']:return self.jsonreply({'error':'Not found'},404)
        try:
            n=int(self.headers.get('Content-Length','0'))
            if n>4096:return self.jsonreply({'error':'Too large'},400)
            data=json.loads(self.rfile.read(n) or b'{}')
            if path=='/api/port':
                value=str(data.get('port','')).strip()
                available=[x['device'] for x in ports()]
                if value and value not in available:return self.jsonreply({'error':'Port not found. Rescan ports.'},400)
                with st.lock:st.port=value or None;st.error='Switching port...';st.connected=False
                st.reconnect.set();return self.jsonreply({'ok':True,'port':value})
            with st.lock:
                st.samples.clear();st.seq+=1;st.all_count=0;st.bad=0;st.started=time.monotonic()
            return self.jsonreply({'ok':True})
        except (ValueError,TypeError) as e:return self.jsonreply({'error':str(e)},400)
    def sse(self):
        self.send_response(200);self.send_header('Content-Type','text/event-stream; charset=utf-8')
        self.send_header('Cache-Control','no-store, no-transform');self.send_header('Connection','keep-alive')
        self.send_header('X-Accel-Buffering','no');self.end_headers()
        try:seq=int(self.headers.get('Last-Event-ID','0'))
        except ValueError:seq=0
        # Do not replay old data after a new browser connection; receive current live stream only.
        if seq==0:seq=st.packet()['seq']
        laststatus=0
        try:
            while True:
                batch=st.frames_since(seq)
                if batch:
                    seq=batch[-1]['seq']
                    payload=json.dumps({'frames':batch},separators=(',',':'))
                    self.wfile.write(f'event: frames\nid: {seq}\ndata: {payload}\n\n'.encode())
                if time.monotonic()-laststatus>.8:
                    payload=json.dumps(st.packet(),separators=(',',':'))
                    self.wfile.write(f'event: status\ndata: {payload}\n\n'.encode())
                    laststatus=time.monotonic()
                self.wfile.flush();time.sleep(.17)
        except (BrokenPipeError,ConnectionResetError,ConnectionAbortedError,OSError):pass

class Server(ThreadingHTTPServer):daemon_threads=True;allow_reuse_address=True

def main():
    threading.Thread(target=replay_worker if st.replay else serial_worker,args=(st.replay,) if st.replay else (),daemon=True).start()
    try:httpd=Server(('127.0.0.1',args.http_port),Handler)
    except OSError as e:
        print(f'Cannot start dashboard on port {args.http_port}: {e}',file=sys.stderr);sys.exit(1)
    url=f'http://127.0.0.1:{args.http_port}/index.html'
    print('\nSMARTINSOLE LIVE DASHBOARD',flush=True)
    print(f'  Open: {url}',flush=True)
    print(f'  ESP32 USB: {st.port or "AUTO-DETECT"} @ {st.baud} baud',flush=True)
    print('  Close Arduino Serial Monitor, otherwise serial port will be busy.',flush=True)
    if st.replay:print('  REPLAY MODE: synthetic/recorded data, NOT real ESP32!',flush=True)
    if not args.no_browser:threading.Timer(.8,lambda:webbrowser.open(url)).start()
    try:httpd.serve_forever()
    except KeyboardInterrupt:print('\nDashboard stopped.')
    finally:httpd.server_close()
if __name__=='__main__':main()
