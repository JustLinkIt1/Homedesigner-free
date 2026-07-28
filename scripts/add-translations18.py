# Batch 18: the garden set (Phase C4) — outdoor furniture and planting names.
import os
LANGS = ['fr','es','tr','de','it','pt','nl','pl','ru','ja','ko','zh']
ROOT = os.path.join(os.path.dirname(__file__), '..', 'src', 'locales')
KEYS = {
  'Tree': ['Arbre','Árbol','Ağaç','Baum','Albero','Árvore','Boom','Drzewo','Дерево','木','나무','树'],
  'Small Tree': ['Petit arbre','Árbol pequeño','Küçük ağaç','Kleiner Baum','Alberello','Árvore pequena','Kleine boom','Małe drzewo','Небольшое дерево','低木','작은 나무','小树'],
  'Hedge': ['Haie','Seto','Çit bitkisi','Hecke','Siepe','Cerca viva','Haag','Żywopłot','Живая изгородь','生け垣','생울타리','绿篱'],
  'Bistro Set': ['Salon de jardin','Juego de bistró','Bistro takımı','Bistro-Set','Set da bistrò','Conjunto bistrô','Bistroset','Zestaw bistro','Комплект бистро','ビストロセット','비스트로 세트','户外桌椅套装'],
  'Garden Chair': ['Chaise de jardin','Silla de jardín','Bahçe sandalyesi','Gartenstuhl','Sedia da giardino','Cadeira de jardim','Tuinstoel','Krzesło ogrodowe','Садовый стул','ガーデンチェア','정원 의자','花园椅'],
  'Parasol': ['Parasol','Sombrilla','Şemsiye','Sonnenschirm','Ombrellone','Guarda-sol','Parasol','Parasol','Зонт от солнца','パラソル','파라솔','遮阳伞'],
  'Sun Lounger': ['Transat','Tumbona','Şezlong','Sonnenliege','Lettino','Espreguiçadeira','Ligbed','Leżak','Шезлонг','サンラウンジャー','선베드','躺椅'],
  'Barbecue': ['Barbecue','Barbacoa','Barbekü','Grill','Barbecue','Churrasqueira','Barbecue','Grill','Барбекю','バーベキュー','바비큐','烧烤炉'],
  'Fire Pit': ['Brasero','Brasero','Ateş çukuru','Feuerstelle','Braciere','Fogueira','Vuurkorf','Palenisko','Кострище','ファイヤーピット','화로대','火塘'],
  'Planter Box': ['Jardinière','Jardinera','Saksı teknesi','Pflanzkasten','Fioriera','Floreira','Plantenbak','Skrzynia na rośliny','Ящик для растений','プランター','화단 상자','花箱'],
  'Long Planter': ['Grande jardinière','Jardinera larga','Uzun saksı teknesi','Langer Pflanzkasten','Fioriera lunga','Floreira longa','Lange plantenbak','Długa skrzynia','Длинный ящик','ロングプランター','긴 화단 상자','长花箱'],
  'Tree Stump Seat': ['Tabouret rondin','Asiento de tronco','Kütük oturak','Baumstumpf-Hocker','Sgabello ceppo','Banco de tronco','Boomstamkruk','Siedzisko z pnia','Пень-табурет','切り株スツール','그루터기 의자','树桩凳'],
  'Garden Lamp': ['Lampadaire de jardin','Farol de jardín','Bahçe lambası','Gartenlampe','Lampione da giardino','Luminária de jardim','Tuinlamp','Lampa ogrodowa','Садовый фонарь','ガーデンランプ','정원 조명','花园灯'],
  'Outdoor Bin': ['Poubelle extérieure','Papelera exterior','Dış mekân çöp kovası','Mülleimer außen','Cestino da esterno','Lixeira externa','Buitenprullenbak','Kosz zewnętrzny','Уличная урна','屋外ゴミ箱','실외 쓰레기통','户外垃圾桶'],
  'Watering Can': ['Arrosoir','Regadera','Sulama kabı','Gießkanne','Annaffiatoio','Regador','Gieter','Konewka','Лейка','じょうろ','물뿌리개','洒水壶'],
  'Terrace': ['Terrasse','Terraza','Teras','Terrasse','Terrazza','Terraço','Terras','Taras','Терраса','テラス','테라스','露台'],
  'Garden Gnome': ['Nain de jardin','Gnomo de jardín','Bahçe cücesi','Gartenzwerg','Nano da giardino','Gnomo de jardim','Tuinkabouter','Krasnal ogrodowy','Садовый гном','ガーデンノーム','정원 요정','花园小矮人'],
}
for i, lang in enumerate(LANGS):
    path = os.path.join(ROOT, f'{lang}.ts')
    src = open(path, encoding='utf-8').read()
    added = 0
    for key, vals in KEYS.items():
        assert len(vals) == 12, key
        qkey = key.replace("'", "\\'")
        bare = key.isidentifier() and f'\n  {key}:' in src
        if bare or f"'{qkey}':" in src or f'"{key}":' in src:
            continue
        qval = vals[i].replace("'", "\\'")
        idx = src.rstrip().rfind('};')
        src = src[:idx] + f"  '{qkey}': '{qval}',\n}};" + src.rstrip()[idx+2:] + '\n'
        added += 1
    open(path, 'w', encoding='utf-8').write(src)
    print(lang, added)
print('batch18 (garden set) done')
