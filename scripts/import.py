"""Read the original Navicat archive; never execute source PHP or backup SQL."""
from pathlib import Path
import argparse, collections, gzip, json, mimetypes, re, shutil, tarfile

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--source', default='/Users/hxzhouh/Downloads/201810aiaoni')
parser.add_argument('--skip-assets', action='store_true')
parser.add_argument('--backup', default='/Users/hxzhouh/Downloads/20261113143924.nb3')
args = parser.parse_args()
source = Path(args.source)
TABLES = {'category','article','case','biaoshi','page','slide','slide_data','block','link','config','attachment','tags','tags_data'}
PUBLIC_CONFIG = {'site_name','site_title','site_url','seo_title','seo_keywords','seo_description','site_email','tel','phone','phone_a','address','baiduxy','icpnum','between','site_logo','site_copyright'}

def values(row):
    s=row.strip()[1:-1]; result=[]; i=0
    while i<len(s):
        while i<len(s) and s[i] in ' ,\r\n': i+=1
        if i>=len(s): break
        if s[i]=="'":
            i+=1; out=[]
            while i<len(s):
                if s[i]=='\\':
                    i+=1
                    out.append({'n':'\n','r':'\r','t':'\t','0':'\0','Z':'\x1a'}.get(s[i],s[i])); i+=1
                elif s[i]=="'":
                    if i+1<len(s) and s[i+1]=="'":out.append("'");i+=2
                    else:i+=1;break
                else:out.append(s[i]);i+=1
            result.append(''.join(out))
        else:
            end=s.find(',',i)
            if end<0:end=len(s)
            word=s[i:end].strip();i=end
            result.append(None if word.upper()=='NULL' else float(word) if '.' in word else int(word))
    return result

def literal(v, dialect):
    if v is None:return 'NULL'
    if isinstance(v,(int,float)):return str(v)
    # MySQL backslash semantics differ from SQLite; avoid backslash escapes entirely.
    if dialect=='mysql':return 'CONVERT(0x'+v.encode().hex()+' USING utf8mb4)' if v else "''"
    return "'"+v.replace("'","''").replace('\0','')+"'"

data={};meta={}
with tarfile.open(args.backup) as archive:
    manifest=json.load(archive.extractfile('meta.json'))
    for obj in manifest['Objects']:
        name=obj['Name']
        if name.removeprefix('jzw_') not in TABLES:continue
        m=json.loads(gzip.decompress(archive.extractfile(obj['Metadata']['Filename']).read()))
        rows=[]
        for part in m.get('Data',[]):
            raw=gzip.decompress(archive.extractfile(part['Filename']).read()).decode('utf8')
            for row in raw.split('\x1e'):
                if not row.strip():continue
                vs=values(row)
                if len(vs)!=len(m['Fields']):raise ValueError(f'Invalid row in {name}')
                rows.append(dict(zip(m['Fields'],vs)))
        if name=='jzw_config': rows=[r for r in rows if r['varname'] in PUBLIC_CONFIG]
        data[name]=rows;meta[name]=m

for dialect in ['d1','mysql']:
    statements=['-- Generated from the original Navicat backup; public website content only.']
    if dialect=='mysql':statements.append('SET NAMES utf8mb4;')
    for table,rows in data.items():
        m=meta[table]; ddl=m['DDL']; fields=m['Fields']
        pkmatch=re.search(r'PRIMARY KEY\s*\(([^)]+)\)',ddl,re.I)
        pk=re.findall(r'`([^`]+)`',pkmatch[1]) if pkmatch else []
        defs=[]
        for f in fields:
            col=re.search(r'`'+re.escape(f)+r'`\s+(\w+)',ddl)
            kind=col[1].lower() if col else 'text'
            typ=('BIGINT' if dialect=='mysql' else 'INTEGER') if 'int' in kind else ('DOUBLE' if dialect=='mysql' else 'REAL') if kind in ['decimal','float','double'] else ('VARCHAR(191)' if dialect=='mysql' and f in pk else 'LONGTEXT' if dialect=='mysql' else 'TEXT')
            defs.append(f'`{f}` {typ}')
        if pk:defs.append('PRIMARY KEY ('+','.join('`'+f+'`' for f in pk)+')')
        statements.append('CREATE TABLE IF NOT EXISTS `'+table+'` ('+','.join(defs)+')'+(' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4' if dialect=='mysql' else '')+';')
        for row in rows:
            statements.append('INSERT INTO `'+table+'` ('+','.join('`'+f+'`' for f in fields)+') VALUES ('+','.join(literal(row[f],dialect) for f in fields)+');')
    t='LONGTEXT' if dialect=='mysql' else 'TEXT'
    statements += [
        f'CREATE TABLE IF NOT EXISTS cms_translations (entity VARCHAR(40) NOT NULL, entity_id BIGINT NOT NULL, locale VARCHAR(10) NOT NULL, fields {t} NOT NULL, published INTEGER NOT NULL DEFAULT 0, updated_at BIGINT NOT NULL, PRIMARY KEY(entity,entity_id,locale));',
        f'CREATE TABLE IF NOT EXISTS cms_settings (name VARCHAR(100) PRIMARY KEY, value {t} NOT NULL);',
        f'CREATE TABLE IF NOT EXISTS cms_revisions (id VARCHAR(64) PRIMARY KEY, entity VARCHAR(40), entity_id BIGINT, locale VARCHAR(10), data {t}, created_at BIGINT);',
        f'CREATE TABLE IF NOT EXISTS cms_inquiries (id VARCHAR(64) PRIMARY KEY, name VARCHAR(200), email VARCHAR(200), phone VARCHAR(80), message {t}, locale VARCHAR(10), created_at BIGINT, status VARCHAR(20) DEFAULT \'new\');',
        'CREATE TABLE IF NOT EXISTS cms_media (path VARCHAR(191) PRIMARY KEY, name VARCHAR(200), size BIGINT, type VARCHAR(100), created_at BIGINT);',
        'CREATE TABLE IF NOT EXISTS cms_rate_limits (id VARCHAR(191) PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, expires_at BIGINT NOT NULL);'
    ]
    for f in (source/'Uploads').rglob('*'):
        if f.is_file():
            row=['/'+str(f.relative_to(source)),f.name,f.stat().st_size,mimetypes.guess_type(f)[0] or 'application/octet-stream',int(f.stat().st_mtime)]
            statements.append('INSERT INTO cms_media (path,name,size,type,created_at) VALUES ('+','.join(literal(v,dialect) for v in row)+');')
    dest=ROOT/('migrations' if dialect=='d1' else 'migrations-mysql')
    dest.mkdir(exist_ok=True)
    schema_statements=[s for s in statements if not s.startswith('INSERT INTO')];seed_statements=[s for s in statements if s.startswith('INSERT INTO')]
    (dest/'0001_schema.sql').write_text('\n'.join(schema_statements)+'\n')
    (ROOT/'seeds').mkdir(exist_ok=True)
    (ROOT/'seeds'/('original-'+dialect+'.sql')).write_text('\n'.join(seed_statements)+'\n')

allowed={'.jpg','.jpeg','.png','.gif','.webp','.svg','.ico','.css','.js','.woff','.woff2','.ttf','.eot','.otf','.mp4','.swf'}
count=0
for folder in ([] if args.skip_assets else ['Uploads','Jzw/Tpl/Home/Default','Jzw/Tpl/Wap/Default','Public']):
    for f in (source/folder).rglob('*'):
        if f.is_file() and f.suffix.lower() in allowed:
            dest=ROOT/'public'/f.relative_to(source);dest.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(f,dest);count+=1
shutil.copy2(source/'aiaoni.ico',ROOT/'public/aiaoni.ico')
if args.skip_assets:
    count=sum(1 for folder in ['Uploads','Jzw/Tpl/Home/Default','Jzw/Tpl/Wap/Default','Public'] for f in (source/folder).rglob('*') if f.is_file() and f.suffix.lower() in allowed)
# Keep a small route manifest in application code; article bodies stay in the database.
routes={}
for table in ['jzw_category','jzw_article','jzw_case','jzw_biaoshi']:
    for r in data[table]:
        url=re.sub(r'^https?://(?:www\.)?hnaan\.cn','',str(r.get('url','')))
        if url.startswith('/'):routes[url]={'entity':table,'id':r['id']}
(ROOT/'src/generated/routes.json').write_text(json.dumps(routes,ensure_ascii=False,separators=(',',':')))
column_types={n:{f:('number' if re.search(r'`'+re.escape(f)+r'`\s+(?:\w*int|decimal|float|double)\b',m['DDL'],re.I) else 'string') for f in m['Fields']} for n,m in meta.items()}
(ROOT/'src/generated/column-types.json').write_text(json.dumps(column_types))
(ROOT/'src/generated/schema.json').write_text(json.dumps({n:m['Fields'] for n,m in meta.items()},ensure_ascii=False))
(ROOT/'src/generated/seed-summary.json').write_text(json.dumps({'tables':{n:len(rows) for n,rows in data.items()},'assets':count,'sourceDatabase':manifest['Schema']},ensure_ascii=False,indent=2))
print(json.dumps({'tables':{n:len(rows) for n,rows in data.items()},'assets':count},ensure_ascii=False))
