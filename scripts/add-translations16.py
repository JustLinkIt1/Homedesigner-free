# Batch 16: outdoor surfaces (Phase C) — the Outdoor card on a selected room
# and the hardscape material names.
import os
LANGS = ['fr','es','tr','de','it','pt','nl','pl','ru','ja','ko','zh']
ROOT = os.path.join(os.path.dirname(__file__), '..', 'src', 'locales')
KEYS = {
  'Outdoor surface': ['Surface extérieure','Superficie exterior','Dış mekân yüzeyi','Außenfläche','Superficie esterna','Superfície externa','Buitenoppervlak','Nawierzchnia zewnętrzna','Наружное покрытие','屋外の面','실외 표면','室外地面'],
  'Outdoor area': ['Espace extérieur','Zona exterior','Dış mekân alanı','Außenbereich','Area esterna','Área externa','Buitenruimte','Strefa zewnętrzna','Наружная зона','屋外エリア','실외 영역','室外区域'],
  'Turn this area into a patio, deck, driveway or path. It sits on the ground with no ceiling above it.': [
    'Transformez cette zone en terrasse, deck, allée ou chemin. Elle repose sur le sol, sans plafond au-dessus.',
    'Convierte esta zona en un patio, tarima, entrada o sendero. Se apoya en el suelo y no tiene techo encima.',
    'Bu alanı teras, ahşap deck, araç yolu veya patikaya dönüştürün. Zemine oturur ve üzerinde tavan olmaz.',
    'Mach aus dieser Fläche eine Terrasse, ein Deck, eine Einfahrt oder einen Weg. Sie liegt auf dem Boden, ohne Decke darüber.',
    'Trasforma quest’area in un patio, una pedana, un vialetto o un sentiero. Poggia sul terreno e non ha soffitto sopra.',
    'Transforme esta área em um pátio, deck, entrada de garagem ou caminho. Fica no chão e não tem teto acima.',
    'Maak van dit vlak een terras, vlonder, oprit of pad. Het ligt op de grond en heeft geen plafond erboven.',
    'Zamień ten obszar w taras, pomost, podjazd lub ścieżkę. Leży na gruncie i nie ma nad sobą sufitu.',
    'Превратите эту область в патио, настил, подъезд или дорожку. Она лежит на земле, потолка над ней нет.',
    'このエリアをテラス・デッキ・アプローチ・小道にします。地面の上に置かれ、天井は付きません。',
    '이 영역을 파티오, 데크, 진입로 또는 산책로로 만듭니다. 지면에 놓이며 위에 천장이 없습니다.',
    '把这块区域变成露台、木平台、车道或小径。它位于地面上，上方没有天花板。',
  ],
  'Paving': ['Dallage','Pavimento','Döşeme taşı','Pflaster','Pavimentazione','Pavimentação','Bestrating','Kostka','Мощение','舗装','포장','铺石'],
  'Decking': ['Terrasse bois','Tarima','Ahşap deck','Holzdeck','Pedana in legno','Deck de madeira','Vlonder','Deski tarasowe','Настил','ウッドデッキ','목재 데크','木平台'],
  'Gravel': ['Gravier','Grava','Çakıl','Kies','Ghiaia','Cascalho','Grind','Żwir','Гравий','砂利','자갈','碎石'],
  'Asphalt': ['Enrobé','Asfalto','Asfalt','Asphalt','Asfalto','Asfalto','Asfalt','Asfalt','Асфальт','アスファルト','아스팔트','沥青'],
  'Lawn': ['Pelouse','Césped','Çim','Rasen','Prato','Gramado','Gazon','Trawnik','Газон','芝生','잔디','草坪'],
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
print('batch16 (outdoor surfaces) done')
