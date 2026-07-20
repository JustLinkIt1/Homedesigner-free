# Batch 8 (v1.0.70): Settings — launch-intro toggle.
import os
LANGS = ['fr','es','tr','de','it','pt','nl','pl','ru','ja','ko','zh']
ROOT = os.path.join(os.path.dirname(__file__), '..', 'src', 'locales')
KEYS = {
  'Startup': ['Démarrage','Inicio','Başlangıç','Start','Avvio','Inicialização','Opstarten','Uruchamianie','Запуск','起動','시작','启动'],
  'Play intro animation': ['Lire l’animation d’intro','Reproducir animación de inicio','Açılış animasyonunu oynat','Intro-Animation abspielen','Riproduci animazione iniziale','Reproduzir animação de abertura','Intro-animatie afspelen','Odtwarzaj animację wstępną','Показывать заставку','イントロ動画を再生','인트로 애니메이션 재생','播放开场动画'],
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
print('batch8 done')
