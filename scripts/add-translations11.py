# Batch 11: exterior cladding card (Properties).
import os
LANGS = ['fr','es','tr','de','it','pt','nl','pl','ru','ja','ko','zh']
ROOT = os.path.join(os.path.dirname(__file__), '..', 'src', 'locales')
KEYS = {
  'Exterior': ['Extérieur','Exterior','Dış cephe','Außen','Esterno','Exterior','Buitenkant','Elewacja','Фасад','外装','외벽','外墙'],
  'Clad every outside wall face in one go.': [
    'Habillez toutes les faces extérieures en une fois.',
    'Reviste todas las caras exteriores de una vez.',
    'Tüm dış duvar yüzeylerini tek seferde kaplayın.',
    'Alle Außenwandflächen auf einmal verkleiden.',
    'Rivesti tutte le facciate esterne in una volta.',
    'Revista todas as faces externas de uma vez.',
    'Bekleed alle buitenmuren in één keer.',
    'Wykończ wszystkie zewnętrzne ściany naraz.',
    'Отделайте все наружные грани стен разом.',
    '外壁の面をまとめて仕上げます。',
    '모든 외벽 면을 한 번에 마감합니다.',
    '一次性为所有外墙面铺设饰面。',
  ],
  'Exterior applied to': ['Extérieur appliqué à','Exterior aplicado a','Dış cephe uygulandı:','Außen angewendet auf','Esterno applicato a','Exterior aplicado a','Buitenkant toegepast op','Elewacja zastosowana do','Фасад применён к','外装を適用:','외벽 적용:','外墙已应用于'],
  'face': ['face','cara','yüz','Fläche','faccia','face','vlak','ściana','грань','面','면','面'],
  'faces': ['faces','caras','yüz','Flächen','facce','faces','vlakken','ścian','граней','面','면','面'],
  'No outside wall faces found — draw the outer walls first.': [
    'Aucune face extérieure trouvée — dessinez d’abord les murs extérieurs.',
    'No se han encontrado caras exteriores: dibuja primero los muros exteriores.',
    'Dış duvar yüzeyi bulunamadı — önce dış duvarları çizin.',
    'Keine Außenflächen gefunden — zeichne zuerst die Außenwände.',
    'Nessuna faccia esterna trovata: disegna prima i muri perimetrali.',
    'Nenhuma face externa encontrada — desenhe primeiro as paredes externas.',
    'Geen buitenvlakken gevonden — teken eerst de buitenmuren.',
    'Nie znaleziono ścian zewnętrznych — najpierw narysuj mury zewnętrzne.',
    'Наружные грани не найдены — сначала начертите внешние стены.',
    '外壁面が見つかりません — 先に外周の壁を描いてください。',
    '외벽 면이 없습니다 — 먼저 외벽을 그려 주세요.',
    '未找到外墙面 — 请先绘制外墙。',
  ],
}
for i, lang in enumerate(LANGS):
    path = os.path.join(ROOT, f'{lang}.ts')
    src = open(path, encoding='utf-8').read()
    added = 0
    for key, vals in KEYS.items():
        assert len(vals) == 12, key
        qkey = key.replace("'", "\\'")
        if f"'{qkey}':" in src or f'"{key}":' in src:
            continue
        qval = vals[i].replace("'", "\\'")
        idx = src.rstrip().rfind('};')
        src = src[:idx] + f"  '{qkey}': '{qval}',\n}};" + src.rstrip()[idx+2:] + '\n'
        added += 1
    open(path, 'w', encoding='utf-8').write(src)
    print(lang, added)
print('batch11 done')
