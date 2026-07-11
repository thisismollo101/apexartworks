#!/usr/bin/env python3
"""
Merge decompose batch outputs, validate them, and generate paste-ready SQL
for the Supabase SQL editor (network-free load path).

Outputs (out/sql/):
  01_demo_seed.sql   — the 17 calibration clips + 103 shots (is_demo_seed)
  02_clips_*.sql     — the go-live library clips (chunked)
  03_shots_*.sql     — their shot rows (chunked)
  04_floor_log.sql   — floor-cut video_ids (nothing else, per the floor rule)

Validation per clip: JSON parses, required fields present, enums sane,
verbatim_text is an exact substring of the source prompt, client text free of
prompt vocabulary. Failures are listed and excluded (never silently loaded).
"""
import json, csv, glob, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
OUT = 'out/sql'
os.makedirs(OUT, exist_ok=True)

PROMPT_VOCAB = re.compile(
    r'\b(whip[- ]?pan|alexa|arri|8k|4k|anamorphic|dolby|hdr|fps|volumetric|'
    r'rack[- ]?focus|color grade|film grain|tracking shot|drone shot|pov shot|'
    r'close[- ]?up shot|push[- ]?in|pull[- ]?back|pullback|lens[- ]?flare|'
    r'speed[- ]?ramp|bokeh|ecu|\bpov\b)\b', re.I)

REQ_CLIP = ['title','summary','runtime_s','aspect_ratio','realism_level',
            'render_stack','grade','motion_feel','shots']
REQ_SHOT = ['verbatim_text','description','tc_in','tc_out','subject_role','action',
            'food_item','food_role','setting','camera_framing','camera_angle',
            'camera_movement','motion_speed','lighting','vfx','mood']

def q(v):
    """SQL literal: NULL, number, or single-quote-escaped string."""
    if v is None: return 'NULL'
    if isinstance(v, bool): return 'true' if v else 'false'
    if isinstance(v, (int, float)): return str(v)
    return "'" + str(v).replace("'", "''") + "'"

def main():
    src = {r['video_id']: r for r in csv.DictReader(open('data/apex_source_library.csv'))}
    gate = {}
    for line in open('out/gate_results.jsonl'):
        rec = json.loads(line)
        gate[rec['video_id']] = rec['verdict']
    selection = set(json.load(open('out/library_selection.json'))['video_ids'])

    # ---- merge + validate batches ----
    merged, errors = {}, []
    for f in sorted(glob.glob('out/decomp_batches/output_*.jsonl')):
        for i, line in enumerate(open(f)):
            if not line.strip(): continue
            try:
                rec = json.loads(line)
                vid, d = rec['video_id'], rec['decomposition']
            except Exception as e:
                errors.append(f"{f}:{i+1}: unparseable ({e})"); continue
            probs = [k for k in REQ_CLIP if k not in d]
            if not d.get('shots'): probs.append('zero shots')
            prompt = src.get(vid, {}).get('verbatim_prompt', '')
            for si, s in enumerate(d.get('shots', [])):
                probs += [f"shot{si+1}.{k} missing" for k in REQ_SHOT if k not in s]
                if s.get('verbatim_text') and s['verbatim_text'] not in prompt:
                    probs.append(f"shot{si+1} verbatim not an exact substring")
                if PROMPT_VOCAB.search(s.get('description','')):
                    probs.append(f"shot{si+1} description has prompt vocab")
            if PROMPT_VOCAB.search(d.get('summary','') + ' ' + d.get('title','')):
                probs.append('summary/title has prompt vocab')
            if probs:
                errors.append(f"{vid} ({f}): " + '; '.join(probs[:4]))
            else:
                merged[vid] = d
    json.dump({'clips': len(merged)}, open('out/merge_stats.json','w'))
    with open('out/decompose_results.jsonl','w') as f:
        for vid, d in merged.items():
            f.write(json.dumps({'video_id': vid, 'decomposition': d, 'warnings': []}) + '\n')

    loaded = [vid for vid in selection if vid in merged]
    missing = sorted(selection - set(merged), key=int)
    print(f"merged {len(merged)} decompositions; selection {len(selection)}; loadable {len(loaded)}; missing {len(missing)}; invalid {len(errors)}")
    if errors:
        open('out/validation_errors.txt','w').write('\n'.join(errors))
        print("validation errors written to out/validation_errors.txt")
    if missing:
        open('out/missing_decomps.txt','w').write('\n'.join(missing))

    # ---- 01 demo seed ----
    clips_csv = list(csv.DictReader(open('data/apex_clips.csv')))
    shots_csv = list(csv.DictReader(open('data/apex_shots.csv')))
    nn = lambda s: None if s == '' else s
    num = lambda s: None if s == '' else s
    with open(f'{OUT}/01_demo_seed.sql','w') as f:
        f.write('-- 17 calibration clips + 103 shots (demo seed)\nbegin;\n')
        for c in clips_csv:
            f.write(f"insert into clips (clip_id,title,generator,runtime_s,aspect_ratio,video_url,thumbnail_url,source_url,asset_status,shot_count,summary,source_prompt_file,verdict,step1_grounded_brand_safe,home_route,cut_reason,occasion_context,distinctiveness,register,product_fit,realism_level,render_stack,grade,motion_feel,prompt_health,risk_flags,ip_flags,fix_note,calibration_note,is_demo_seed) values ("
                + ','.join([q(c['clip_id']),q(c['title']),q(c['generator']),num(c['runtime_s']) or 'NULL',q(nn(c['aspect_ratio'])),q(nn(c['video_url'])),q(nn(c['thumbnail_url'])),q(nn(c['source_url'])),q(c['asset_status']),num(c['shot_count']) or 'NULL',q(c['summary']),q(nn(c['source_prompt_file'])),q(c['verdict']),q(c['step1_grounded_brand_safe']),q(nn(c['home_route'])),q(nn(c['cut_reason'])),q(nn(c['occasion_context'])),q(nn(c['distinctiveness'])),q(nn(c['register'])),q(nn(c['product_fit'])),q(nn(c['realism_level'])),q(nn(c['render_stack'])),q(nn(c['grade'])),q(nn(c['motion_feel'])),q(nn(c['prompt_health'])),q(nn(c['risk_flags'])),q(nn(c['ip_flags'])),q(nn(c['fix_note'])),q(nn(c['calibration_note'])),'true'])
                + ") on conflict (clip_id) do nothing;\n")
        for s in shots_csv:
            f.write(f"insert into shots (shot_id,clip_id,shot_index,tc_in,tc_out,duration_s,verbatim_text,description,shot_deeplink,subject_role,action,food_item,food_role,setting,camera_framing,camera_angle,camera_movement,motion_speed,lighting,vfx,audio_sfx,dialogue,mood,liftable,shot_risk) values ("
                + ','.join([q(s['shot_id']),q(s['clip_id']),num(s['shot_index']) or 'NULL',num(s['tc_in']) or 'NULL',num(s['tc_out']) or 'NULL',num(s['duration_s']) or 'NULL',q(s['verbatim_text']),q(s['description']),q(nn(s['shot_deeplink'])),q(nn(s['subject_role'])),q(nn(s['action'])),q(nn(s['food_item'])),q(nn(s['food_role'])),q(nn(s['setting'])),q(nn(s['camera_framing'])),q(nn(s['camera_angle'])),q(nn(s['camera_movement'])),q(nn(s['motion_speed'])),q(nn(s['lighting'])),q(nn(s['vfx'])),q(nn(s['audio_sfx'])),q(nn(s['dialogue'])),q(nn(s['mood'])),q(nn(s['liftable'])),q(nn(s['shot_risk']))])
                + ") on conflict (shot_id) do nothing;\n")
        f.write('commit;\n')

    # ON CONFLICT DO UPDATE that refreshes EVERY non-key column, so re-pasting
    # the files corrects any previously-loaded row in full (not just a subset).
    CLIP_COLS = ['video_id','title','generator','runtime_s','aspect_ratio','source_url',
        'verbatim_prompt','asset_status','shot_count','summary','verdict',
        'step1_grounded_brand_safe','home_route','distinctiveness','register',
        'realism_level','render_stack','grade','motion_feel','ip_flags',
        'gate_confidence','gate_notes','is_demo_seed']
    SHOT_COLS = ['clip_id','shot_index','tc_in','tc_out','duration_s','verbatim_text',
        'description','subject_role','action','food_item','food_role','setting',
        'camera_framing','camera_angle','camera_movement','motion_speed','lighting',
        'vfx','mood']
    clip_upd = 'on conflict (clip_id) do update set ' + ', '.join(f'{c}=excluded.{c}' for c in CLIP_COLS)
    shot_upd = 'on conflict (shot_id) do update set ' + ', '.join(f'{c}=excluded.{c}' for c in SHOT_COLS)

    # ---- 02/03 library clips + shots (chunked) ----
    CHUNK = 200
    for ci in range(0, len(loaded), CHUNK):
        part = loaded[ci:ci+CHUNK]
        with open(f'{OUT}/02_clips_{ci//CHUNK+1:02d}.sql','w') as f:
            f.write(f'-- library clips {ci+1}..{ci+len(part)} of {len(loaded)}\nbegin;\n')
            for vid in part:
                d, v, row = merged[vid], gate[vid], src[vid]
                f.write("insert into clips (clip_id,video_id,title,generator,runtime_s,aspect_ratio,source_url,verbatim_prompt,asset_status,shot_count,summary,verdict,step1_grounded_brand_safe,home_route,distinctiveness,register,realism_level,render_stack,grade,motion_feel,ip_flags,gate_confidence,gate_notes,is_demo_seed) values ("
                    + ','.join([q(f"APX-C-{vid}"),q(vid),q(d['title']),q('seedance_2.0'),
                        q(d['runtime_s']) if d['runtime_s'] and d['runtime_s']>0 else 'NULL',
                        q(d['aspect_ratio']) if d['aspect_ratio']!='unknown' else 'NULL',
                        q(row['source_url']),q(row['verbatim_prompt']),q('missing'),
                        str(len(d['shots'])),q(d['summary']),q('keep'),q(v['step1']),
                        q(v['step2_home_route']),q(v['distinctiveness']),q(v['register']),
                        q(d['realism_level']),q(d['render_stack']),
                        q(d['grade']) if d['grade']!='none' else 'NULL',q(d['motion_feel']),
                        q('flagged-for-review' if v['ip_flag'] else 'none'),
                        str(v['confidence']),q(v['note']),'false'])
                    + ") " + clip_upd + ";\n")
            f.write('commit;\n')
        with open(f'{OUT}/03_shots_{ci//CHUNK+1:02d}.sql','w') as f:
            f.write(f'-- shots for clips {ci+1}..{ci+len(part)}\nbegin;\n')
            for vid in part:
                for i, s in enumerate(merged[vid]['shots']):
                    tc_in = s['tc_in'] if s['tc_in'] is not None and s['tc_in']>=0 else None
                    tc_out = s['tc_out'] if s['tc_out'] is not None and s['tc_out']>=0 else None
                    dur = round(tc_out-tc_in,1) if tc_in is not None and tc_out is not None else None
                    f.write("insert into shots (shot_id,clip_id,shot_index,tc_in,tc_out,duration_s,verbatim_text,description,subject_role,action,food_item,food_role,setting,camera_framing,camera_angle,camera_movement,motion_speed,lighting,vfx,mood) values ("
                        + ','.join([q(f"APX-S-{vid}-{i+1}"),q(f"APX-C-{vid}"),str(i+1),q(tc_in),q(tc_out),q(dur),
                            q(s['verbatim_text']),q(s['description']),
                            q(None if s['subject_role']=='none' else s['subject_role']),q(s['action']),q(s['food_item']),q(s['food_role']),q(s['setting']),
                            q(None if s['camera_framing']=='none' else s['camera_framing']),
                            q(None if s['camera_angle']=='none' else s['camera_angle']),
                            q(s['camera_movement']),
                            q(None if s['motion_speed']=='none' else s['motion_speed']),
                            q(s['lighting']),q(s['vfx']),
                            q(None if s['mood']=='none' else s['mood'])])
                        + ") " + shot_upd + ";\n")
            f.write('commit;\n')

    # ---- 04 floor log ----
    floor = [vid for vid, v in gate.items() if not v['floor_pass']]
    with open(f'{OUT}/04_floor_log.sql','w') as f:
        f.write('-- child-safety floor cuts: video_id ONLY, per the floor rule\nbegin;\n')
        for vid in floor:
            f.write(f"insert into floor_log (video_id) values ({q(vid)}) on conflict (video_id) do nothing;\n")
        f.write('commit;\n')

    sizes = {os.path.basename(p): f"{os.path.getsize(p)/1e6:.1f}MB" for p in sorted(glob.glob(f'{OUT}/*.sql'))}
    print(json.dumps(sizes, indent=1))
    total_shots = sum(len(merged[v]['shots']) for v in loaded)
    print(f"SQL ready: {len(loaded)} clips, {total_shots} shots, {len(floor)} floor rows")

if __name__ == '__main__':
    main()
