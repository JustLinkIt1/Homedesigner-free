# Batch 6 (polish 1.0.61): measure-tool scale-calibration card strings.
import os
LANGS = ['fr','es','tr','de','it','pt','nl','pl','ru','ja','ko','zh']
ROOT = os.path.join(os.path.dirname(__file__), '..', 'src', 'locales')
KEYS = {
  'Set scale from this wall': ['Définir l’échelle depuis ce mur','Definir la escala con este muro','Ölçeği bu duvardan ayarla','Maßstab von dieser Wand setzen','Imposta la scala da questo muro','Definir a escala a partir desta parede','Schaal instellen op deze muur','Ustaw skalę na podstawie tej ściany','Задать масштаб по этой стене','この壁から縮尺を設定','이 벽으로 축척 설정','以此墙设置比例'],
  'Measured:': ['Mesuré :','Medido:','Ölçülen:','Gemessen:','Misurato:','Medido:','Gemeten:','Zmierzono:','Измерено:','計測値：','측정값:','已测量：'],
  'Real length': ['Longueur réelle','Longitud real','Gerçek uzunluk','Reale Länge','Lunghezza reale','Comprimento real','Werkelijke lengte','Rzeczywista długość','Реальная длина','実際の長さ','실제 길이','实际长度'],
  'Scale drawing': ['Mettre à l’échelle','Escalar el plano','Çizimi ölçekle','Zeichnung skalieren','Ridimensiona il disegno','Escalar o desenho','Tekening schalen','Skaluj rysunek','Масштабировать чертёж','図面を拡縮','도면 축척 적용','缩放图纸'],
  'Dismiss': ['Ignorer','Descartar','Kapat','Verwerfen','Ignora','Ignorar','Sluiten','Odrzuć','Закрыть','閉じる','닫기','关闭'],
}
for i, lang in enumerate(LANGS):
    path = os.path.join(ROOT, f'{lang}.ts')
    src = open(path, encoding='utf-8').read()
    added = 0
    for key, vals in KEYS.items():
        assert len(vals) == 12, key
        qkey = key.replace("'", "\\'")
        if f"'{qkey}':" in src or f'"{key}":' in src or f'  {key}:' in src:
            continue
        qval = vals[i].replace("'", "\\'")
        idx = src.rstrip().rfind('};')
        src = src[:idx] + f"  '{qkey}': '{qval}',\n}};" + src.rstrip()[idx+2:] + '\n'
        added += 1
    open(path, 'w', encoding='utf-8').write(src)
    print(lang, added)
print('batch6 done')
