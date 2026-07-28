# Batch 19: patio slider + sample garden labels.
import os
LANGS = ['fr','es','tr','de','it','pt','nl','pl','ru','ja','ko','zh']
ROOT = os.path.join(os.path.dirname(__file__), '..', 'src', 'locales')
KEYS = {
  'Patio Slider': ['Baie coulissante','Puerta corredera','Sürme kapı','Schiebetür','Vetrata scorrevole','Porta de correr','Schuifpui','Drzwi przesuwne','Раздвижная дверь','掃き出し窓','파티오 슬라이딩 도어','推拉门'],
  'Deck': ['Terrasse bois','Tarima','Ahşap teras','Holzterrasse','Pedana','Deck','Vlonderterras','Taras drewniany','Настил','ウッドデッキ','데크','木平台'],
  'Lawn area': ['Pelouse','Zona de césped','Çim alan','Rasenfläche','Prato','Gramado','Gazon','Trawnik','Газон','芝生エリア','잔디 구역','草坪区'],
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
print('batch19 done')
