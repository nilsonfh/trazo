#!/usr/bin/env python3
"""Isometric SGAM cube generator: an example of an isometric layered figure (SGAM: Smart Grid Architecture Model).
The components are a textbook distribution-grid example, mapped onto the SGAM layers, domains and zones.

    python3 sgam_cube.py > cube.svg.html     # an <svg id="cube3d"> fragment

Needs the icon sprite (lib/icons.js, injected into <defs id="cube-ico">), sgam-cube.css and
sgam-cube.js from this folder, and a theme from ../../themes (sgam-cube.css maps its own token names
onto the theme's). See README.md for the projection and the lessons.
"""
import math, sys
A=math.radians(22); C=math.cos(A); SN=math.sin(A)
X0=625; Y0=440; PITCH=240; TH=10
U=520; V=520
COLS=[("GENERATION",0,40),("TRANSMISSION",40,80),("DISTRIBUTION",80,400),("DER",400,460),("CUSTOMER PREMISES",460,520)]
ZONES=["PROCESS","FIELD","STATION","OPERATION","ENTERPRISE · MARKET"]
def yf(L): return Y0+PITCH*L
def P3(u,v,L,hh=0): return (X0+(u-v)*C, yf(L)-(u+v)*SN-hh)
def poly(pts): return " ".join(f"{x:.1f},{y:.1f}" for x,y in pts)
o=[]
LAYERS=["Business","Function","Information","Communication","Component"]
def quad(u0,u1,v0,v1,L,hh=0): return [P3(u0,v0,L,hh),P3(u1,v0,L,hh),P3(u1,v1,L,hh),P3(u0,v1,L,hh)]
# planes bottom to top so upper slabs overlay
for L in range(4,-1,-1):
    o.append(f'<g class="p3-plane" style="--i:{L}">')
    top=quad(0,U,0,V,L)
    fl=P3(0,0,L); lc=P3(0,V,L); rc=P3(U,0,L)
    o.append('<polygon class="p3-sl" points="%s"/>'%poly([lc,fl,(fl[0],fl[1]+TH),(lc[0],lc[1]+TH)]))
    o.append('<polygon class="p3-sr" points="%s"/>'%poly([fl,rc,(rc[0],rc[1]+TH),(fl[0],fl[1]+TH)]))
    o.append('<polygon class="p3-face" points="%s"/>'%poly(top))
    o.append('<polygon class="p3-slice" points="%s"/>'%poly(quad(80,400,0,V,L)))
    if L in (3,4): o.append('<polygon class="band" points="%s"/>'%poly(quad(80,400,104,312,L)))
    for c in (40,80,400,460):
        a=P3(c,0,L);b=P3(c,V,L); o.append(f'<line class="p3-grid" x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}"/>')
    for v in (104,208,312,416):
        a=P3(0,v,L);b=P3(U,v,L); o.append(f'<line class="p3-grid" x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}"/>')
    o.append('</g>')
# operating cell prism: dist col, field+station rows, function..component
for L in (1,4): o.append('<polygon class="p3-oc" points="%s"/>'%poly(quad(80,400,104,312,L)))
for u in (80,400):
    for v in (104,312):
        a=P3(u,v,1);b=P3(u,v,4); o.append(f'<line class="p3-oc" x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}"/>')

# components: key,L,u,v,stack,fam,dash,icon,title,sub,side,tooltip
T=[
("op",0,230,468,"mkt","n",0,"coin","Market operator","tariffs · settlement","R","Business plane, enterprise/market zone: the market operator and the rules it settles by."),
("dms",1,190,364,"ops","p",0,"chip","Distribution management","state estimation · switching","R","Function plane, operation zone: the distribution management system: state estimation, switching orders, outage management."),
("apps",1,110,208,"plat","a",0,"apps","Edge applications","volt-var · fault location","R","Function plane, field and station zones: applications that run close to the equipment, such as volt-var control and fault location."),
("model",2,190,364,"ops","p",0,"database","Network model","CIM · IEC 61968/61970","R","Information plane, operation zone: the network model, exchanged in the Common Information Model."),
("mkt",2,230,468,"mkt","n",0,"apps","Market data","bids · schedules","R","Information plane, enterprise/market zone: bids, schedules and settlement data."),
("dm",2,110,208,"plat","a",1,"certificate","Device data models","IEC 61850 · DNP3 points","R","Information plane, field and station zones: the data models of the devices, IEC 61850 logical nodes and DNP3 points."),
("bus",3,110,208,"plat","a",1,"broker","Station bus","GOOSE · MMS","R","Communication plane, field and station zones: the station bus that carries IEC 61850 GOOSE and MMS."),
("wan",3,190,364,"ops","p",0,"radio","Wide-area network","fibre · cellular · private LTE","R","Communication plane, operation zone: the wide-area network back to the control centre."),
("assets",4,110,52,"ctx","n",0,"recloser","Primary equipment","recloser · regulator","R","Component plane, process zone, Distribution domain: the primary equipment: reclosers, regulators, capacitor banks."),
("der",4,430,52,"ctx","n",0,"pv","DER","pv · storage","R","Component plane, process zone, DER domain: distributed energy resources, PV and storage."),
("ctl",4,110,156,"plat","a",0,"cabinet","Pole-top controller","beside the recloser","R","Component plane, field zone: the controller mounted beside the recloser."),
("rtu",4,270,156,"plat","a",0,"rtu","RTU","telemetry · control","R","Component plane, field zone: the remote terminal unit that reports telemetry and takes control commands."),
("gw",4,110,260,"plat","a",0,"substation","Substation gateway","concentrates the bays","R","Component plane, station zone: the gateway that concentrates the bays of a substation."),
("ied",4,310,260,"plat","a",0,"vm","Protection IED","physical or virtual","R","Component plane, station zone: protection relays, physical or virtualised on a station server."),
("opc",4,190,364,"ops","p",0,"server","Control centre","SCADA · DMS servers","R","Component plane, operation zone: the control centre, where SCADA and the DMS run."),
("cat",4,230,468,"mkt","n",1,"container","Market platform","settlement","R","Component plane, enterprise/market zone: the platform behind the market."),
]
TS=17  # tile half-size (world)
TH_T=11 # tile height
CW,CHH=150,30
pos={}; rects=[]
for k,L,u,v,st,fam,dash,ic,ti,su,side,tp in T:
    x,y=P3(u,v,L); pos[k]=(x,y)
    cx=x+16+CW/2 if side=="R" else x-16-CW/2
    cy=y-TH_T-14
    rects.append((L,k,'chip',cx-CW/2,cy-CHH/2,cx+CW/2,cy+CHH/2))
    pts=quad(u-TS,u+TS,v-TS,v+TS,L,TH_T)
    xs=[p[0] for p in pts]; ys=[p[1] for p in pts]
    rects.append((L,k,'tile',min(xs),min(ys),max(xs),max(ys)+TH_T))
bad=0
for i,a in enumerate(rects):
    for b in rects[i+1:]:
        if a[0]!=b[0] or a[1]==b[1]: continue
        if a[2]=='tile' and b[2]=='tile': continue
        if a[3]<b[5] and b[3]<a[5] and a[4]<b[6] and b[4]<a[6]:
            print("OVERLAP",a[0],a[1],a[2],b[1],b[2],file=sys.stderr); bad+=1
print("overlaps:",bad,file=sys.stderr)

def seg(a,b,cls,st):
    xa,ya=pos[a]; xb,yb=pos[b]
    return f'<line class="{cls}" data-s="{st}" x1="{xa:.1f}" y1="{ya-TH_T:.1f}" x2="{xb:.1f}" y2="{yb-TH_T:.1f}"/>'
for a,b in (("dms","model"),("model","wan"),("wan","opc")): o.append(seg(a,b,"p3-vp","ops"))
for a,b in (("apps","dm"),("dm","bus"),("bus","ctl"),("bus","gw")): o.append(seg(a,b,"p3-va","plat"))
for a,b in (("op","mkt"),("mkt","cat")): o.append(seg(a,b,"p3-vn","mkt"))
ft={"p":"t-p","a":"t-a","n":"t-n"}
for k,L,u,v,st,fam,dash,ic,ti,su,side,tp in sorted(T,key=lambda t:(-t[1],-(t[2]+t[3]))):
    x,y=pos[k]
    top=quad(u-TS,u+TS,v-TS,v+TS,L,TH_T)   # tl,... order: (u0,v0),(u1,v0),(u1,v1),(u0,v1)
    base=quad(u-TS,u+TS,v-TS,v+TS,L,0)
    # visible side faces: front corner is (u0,v0); left face spans (u0,v1)->(u0,v0); right face (u0,v0)->(u1,v0)
    lf=[top[3],top[0],base[0],base[3]]; rf=[top[0],top[1],base[1],base[0]]
    cx=x+16+CW/2 if side=="R" else x-16-CW/2
    cy=y-TH_T-14
    g=1.0
    o.append(f'<g class="cellgroup" data-s="{st}"><title>{tp}</title>'
      f'<ellipse class="p3-foot" cx="{x:.1f}" cy="{y+2:.1f}" rx="26" ry="10"/>'
      f'<polygon class="tl-l tl-{fam}" points="{poly(lf)}"/><polygon class="tl-r tl-{fam}" points="{poly(rf)}"/>'
      f'<polygon class="tl-t tl-{fam}{" tl-dash" if dash else ""}" points="{poly(top)}"/>'
      f'<use class="p3-ico b-{fam}" href="#i-{ic}" width="24" height="24" x="-12" y="-12" transform="matrix({C:.4f},{-SN:.4f},{C:.4f},{SN:.4f},{x:.1f},{y-TH_T:.1f})"/>'
      f'<g class="p3-lab"><line class="p3-stem" x1="{x:.1f}" y1="{y-TH_T:.1f}" x2="{(x+16 if side=="R" else x-16):.1f}" y2="{cy:.1f}"/>'
      f'<rect class="chip-{fam}{" chip-dash" if dash else ""}" x="{cx-CW/2:.1f}" y="{cy-CHH/2:.1f}" width="{CW}" height="{CHH}" rx="7"/>'
      f'<text class="{ft[fam]}" x="{cx:.1f}" y="{cy-2:.1f}" text-anchor="middle">{ti}</text>'
      f'<text class="t-s" x="{cx:.1f}" y="{cy+10:.1f}" text-anchor="middle">{su}</text></g></g>')
# labels
for L,nm in enumerate(LAYERS):
    lc=P3(0,V,L)
    o.append(f'<text class="l-lab" x="{lc[0]-22:.0f}" y="{lc[1]-12:.0f}" text-anchor="end">{nm.replace("|","")}</text>')
for L in (4,):
    for nm,c0,c1 in COLS:
        u=(c0+c1)/2; x,y=P3(u,0,L); o.append(f'<text class="z-lab" x="{x+12:.1f}" y="{y+TH+16:.1f}">{nm}</text>')
    for i,nm in enumerate(ZONES):
        x,y=P3(0,i*104+52,L); o.append(f'<text class="z-lab" x="{x-12:.1f}" y="{y+4:.1f}" text-anchor="end">{nm}</text>')
ly=yf(4)+110
lx=60
o.append(f'<line class="p3-oc" x1="{lx}" y1="{ly}" x2="{lx+32}" y2="{ly}"/><text class="oc-lab" x="{lx+42}" y="{ly+4}">THE DASHED PRISM · FIELD AND STATION ZONES, FUNCTION DOWN TO COMPONENT</text>')
o.append(f'<rect class="band" x="{lx}" y="{ly+16}" width="12" height="12" rx="3" style="opacity:.35"/><text class="plat-lab" x="{lx+20}" y="{ly+26}">THE EDGE STACK · COMPONENT AND COMMUNICATION IN FIELD AND STATION</text>')
o.append(f'<rect class="p3-slice" x="{lx}" y="{ly+40}" width="12" height="12" rx="3" style="opacity:.5"/><text class="d-lab" x="{lx+20}" y="{ly+50}">THE DISTRIBUTION DOMAIN · WHERE MOST COMPONENTS SIT</text>')
H=ly+70
svg="\n    ".join(o)
aria=("The SGAM cube drawn as isometric slabs: five layer planes, each a square with the domains along one floor axis and the zones along the other; every component is a block on its cell with its icon on top.")
sys.stdout.write(f'<svg id="cube3d" viewBox="0 0 1230 {H:.0f}" role="img" aria-label="{aria}">\n    <defs id="cube-ico"></defs>\n    {svg}\n  </svg>\n')
