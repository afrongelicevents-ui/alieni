"""Runs every .select(...) string of the app against a real Supabase project (read-only, with the service key from a Management-API keys JSON file) to catch
relationship ambiguity and missing columns that the local emulator cannot see. Usage: CHECK_PROJECT_REF=<ref> python3 scripts/check-queries-against-db.py keys.json"""
import re, os, json, subprocess, urllib.parse, sys
REF = os.environ.get("CHECK_PROJECT_REF") or sys.exit("Set CHECK_PROJECT_REF to the TEST project reference")
keys=json.load(open(sys.argv[1]))
SVC=[k for k in keys if k["name"]=="service_role" and k["type"]=="legacy"][0]["api_key"]
pat=re.compile(r'\.from\(\s*"(\w+)"\s*\)\s*\.select\(\s*(`[^`]*`|"[^"]*")', re.S)
seen={}
for root,_,files in os.walk("src"):
    for f in files:
        if not f.endswith((".ts",".tsx")) or "__tests__" in root: continue
        p=os.path.join(root,f); s=open(p).read()
        for m in pat.finditer(s):
            tbl, raw = m.group(1), m.group(2)[1:-1]
            if "${" in raw:
                raw = re.sub(r"\$\{[^}]*\}", "", raw).strip().strip(",")
            raw=re.sub(r"\s+","",raw)
            if not raw: continue
            line=s[:m.start()].count("\n")+1
            seen.setdefault((tbl,raw),[]).append(f"{p}:{line}")
extra=[("cleaner_profiles","src/lib/cleaners-live.ts",r'const SELECT =\s*\n?\s*"([^"]+)"'),("jobs","src/lib/business-data.ts",r'run\("([^"]+)"\)')]
for tbl,f,rx in extra:
    t=open(f).read()
    for m in re.finditer(rx,t):
        seen.setdefault((tbl,re.sub(r"\s+","",m.group(1))),[]).append(f)
        if f.endswith("cleaners-live.ts"): seen.setdefault((tbl,re.sub(r"\s+","",m.group(1)).replace("postcode_area","postcode")),[]).append(f+" (old select)")
print(len(seen),"distinct selects")
bad=0
for (tbl,cols),where in sorted(seen.items()):
    url=f"https://{REF}.supabase.co/rest/v1/{tbl}?select={urllib.parse.quote(cols, safe='(),!*:')}&limit=1"
    r=subprocess.run(["curl","-sS","-m","30","-o","/dev/stdout","-w","\n%{http_code}",url,"-H","apikey: "+SVC,"-H","Authorization: Bearer "+SVC],capture_output=True,text=True)
    body,_,code=r.stdout.rpartition("\n")
    if code!="200":
        bad+=1
        try: j=json.loads(body); msg=f'{j.get("code")} {j.get("message","")[:110]} | {str(j.get("hint",""))[:110]}'
        except Exception: msg=body[:150]
        print(f"FAIL {tbl}: {cols[:90]}\n     at {where[0]}{' (+%d more)'%(len(where)-1) if len(where)>1 else ''}\n     {msg}")
print("failing:",bad)
