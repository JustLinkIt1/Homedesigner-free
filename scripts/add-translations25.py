import os
LANGS = ['fr','es','tr','de','it','pt','nl','pl','ru','ja','ko','zh']
ROOT = os.path.join(os.path.dirname(__file__), '..', 'src', 'locales')
# Modular kitchen: worktop and handle controls, the unit swap chips, the new
# unit names in the catalog, and the new library materials.
# Values use the typographic apostrophe (’) only: the writer below does not
# escape ASCII quotes.
KEYS = {
    # ---- Properties panel ----
    'Worktop': [
        'Plan de travail', 'Encimera', 'Tezgâh', 'Arbeitsplatte', 'Piano di lavoro', 'Bancada',
        'Werkblad', 'Blat', 'Столешница', 'ワークトップ', '상판', '台面',
    ],
    'Apply to all kitchen units': [
        'Appliquer à tous les meubles de cuisine', 'Aplicar a todos los muebles de cocina',
        'Tüm mutfak modüllerine uygula', 'Auf alle Küchenelemente anwenden',
        'Applica a tutti i mobili della cucina', 'Aplicar a todos os móveis de cozinha',
        'Op alle keukenelementen toepassen', 'Zastosuj do wszystkich szafek kuchennych',
        'Применить ко всем кухонным модулям', 'すべてのキッチンユニットに適用', '모든 주방 유닛에 적용', '应用到所有厨房单元',
    ],
    'Apply colour to all kitchen units': [
        'Appliquer la couleur à tous les meubles de cuisine', 'Aplicar el color a todos los muebles de cocina',
        'Rengi tüm mutfak modüllerine uygula', 'Farbe auf alle Küchenelemente anwenden',
        'Applica il colore a tutti i mobili della cucina', 'Aplicar a cor a todos os móveis de cozinha',
        'Kleur op alle keukenelementen toepassen', 'Zastosuj kolor do wszystkich szafek kuchennych',
        'Применить цвет ко всем кухонным модулям', 'すべてのキッチンユニットに色を適用', '모든 주방 유닛에 색상 적용', '将颜色应用到所有厨房单元',
    ],
    'Handles': [
        'Poignées', 'Tiradores', 'Kulplar', 'Griffe', 'Maniglie', 'Puxadores', 'Grepen', 'Uchwyty',
        'Ручки', '取っ手', '손잡이', '拉手',
    ],
    'Bar handles': [
        'Poignées barres', 'Tiradores de barra', 'Çubuk kulplar', 'Stangengriffe', 'Maniglie a barra',
        'Puxadores de barra', 'Stanggrepen', 'Uchwyty relingowe', 'Ручки-рейлинги', 'バーハンドル', '바 손잡이', '长条拉手',
    ],
    'Handleless': [
        'Sans poignées', 'Sin tiradores', 'Kulpsuz', 'Grifflos', 'Senza maniglie', 'Sem puxadores',
        'Greeploos', 'Bezuchwytowe', 'Без ручек', 'ハンドルレス', '손잡이 없음', '无拉手',
    ],
    'Apply handles to all kitchen units': [
        'Appliquer les poignées à tous les meubles de cuisine', 'Aplicar los tiradores a todos los muebles de cocina',
        'Kulpları tüm mutfak modüllerine uygula', 'Griffe auf alle Küchenelemente anwenden',
        'Applica le maniglie a tutti i mobili della cucina', 'Aplicar os puxadores a todos os móveis de cozinha',
        'Grepen op alle keukenelementen toepassen', 'Zastosuj uchwyty do wszystkich szafek kuchennych',
        'Применить ручки ко всем кухонным модулям', 'すべてのキッチンユニットに取っ手を適用', '모든 주방 유닛에 손잡이 적용', '将拉手应用到所有厨房单元',
    ],
    # ---- swap chips ----
    'Gas stove': [
        'Cuisinière à gaz', 'Cocina de gas', 'Gazlı ocaklı fırın', 'Gasherd', 'Cucina a gas', 'Fogão a gás',
        'Gasfornuis', 'Kuchenka gazowa', 'Газовая плита', 'ガスコンロ付きオーブン', '가스레인지 오븐', '燃气灶烤箱',
    ],
    'Induction hob': [
        'Plaque à induction', 'Placa de inducción', 'İndüksiyon ocak', 'Induktionskochfeld', 'Piano a induzione',
        'Placa de indução', 'Inductiekookplaat', 'Płyta indukcyjna', 'Индукционная панель', 'IHコンロ', '인덕션', '电磁炉',
    ],
    'Gas hob': [
        'Plaque gaz', 'Placa de gas', 'Gazlı ocak', 'Gaskochfeld', 'Piano a gas', 'Placa a gás',
        'Gaskookplaat', 'Płyta gazowa', 'Газовая панель', 'ガスコンロ', '가스레인지', '燃气灶',
    ],
    'Oven': [
        'Four', 'Horno', 'Fırın', 'Backofen', 'Forno', 'Forno', 'Oven', 'Piekarnik', 'Духовка', 'オーブン', '오븐', '烤箱',
    ],
    'Larder': [
        'Colonne', 'Despensa', 'Kiler dolabı', 'Vorratsschrank', 'Dispensa', 'Despensa', 'Voorraadkast',
        'Spiżarka', 'Пенал', 'パントリー', '키 큰 수납장', '高柜',
    ],
    'Fridge-freezer': [
        'Réfrigérateur-congélateur', 'Frigorífico combi', 'Buzdolabı', 'Kühl-Gefrier-Kombi', 'Frigo-congelatore',
        'Frigorífico combinado', 'Koel-vriescombinatie', 'Lodówka z zamrażarką', 'Холодильник', '冷凍冷蔵庫', '냉장고', '冰箱',
    ],
    'Microwave': [
        'Micro-ondes', 'Microondas', 'Mikrodalga', 'Mikrowelle', 'Microonde', 'Micro-ondas', 'Magnetron',
        'Mikrofalówka', 'Микроволновка', '電子レンジ', '전자레인지', '微波炉',
    ],
    'Hood': [
        'Hotte', 'Campana', 'Davlumbaz', 'Dunstabzug', 'Cappa', 'Exaustor', 'Afzuigkap', 'Okap',
        'Вытяжка', 'レンジフード', '후드', '抽油烟机',
    ],
    # ---- catalog names ----
    'Induction Hob Unit': [
        'Meuble plaque à induction', 'Módulo con placa de inducción', 'İndüksiyon ocaklı modül',
        'Unterschrank mit Induktionskochfeld', 'Base con piano a induzione', 'Módulo com placa de indução',
        'Onderkast met inductiekookplaat', 'Szafka z płytą indukcyjną', 'Модуль с индукционной панелью',
        'IHコンロユニット', '인덕션 유닛', '电磁炉柜',
    ],
    'Gas Hob Unit': [
        'Meuble plaque gaz', 'Módulo con placa de gas', 'Gazlı ocaklı modül', 'Unterschrank mit Gaskochfeld',
        'Base con piano a gas', 'Módulo com placa a gás', 'Onderkast met gaskookplaat', 'Szafka z płytą gazową',
        'Модуль с газовой панелью', 'ガスコンロユニット', '가스레인지 유닛', '燃气灶柜',
    ],
    'Built-under Oven': [
        'Four sous plan', 'Horno bajo encimera', 'Tezgâh altı fırın', 'Unterbau-Backofen', 'Forno sottopiano',
        'Forno sob bancada', 'Onderbouwoven', 'Piekarnik podblatowy', 'Духовка под столешницу',
        'ビルトインオーブン', '빌트인 오븐', '嵌入式烤箱',
    ],
    'Oven with Gas Hob': [
        'Four avec plaque gaz', 'Horno con placa de gas', 'Gazlı ocaklı fırın', 'Backofen mit Gaskochfeld',
        'Forno con piano a gas', 'Forno com placa a gás', 'Oven met gaskookplaat', 'Piekarnik z płytą gazową',
        'Духовка с газовой панелью', 'ガスコンロ付きオーブン', '가스레인지 오븐', '带燃气灶的烤箱',
    ],
    'Integrated Fridge-Freezer': [
        'Réfrigérateur-congélateur intégré', 'Frigorífico combi integrado', 'Ankastre buzdolabı',
        'Integrierte Kühl-Gefrier-Kombi', 'Frigo-congelatore a incasso', 'Frigorífico combinado encastrado',
        'Geïntegreerde koel-vriescombinatie', 'Lodówka do zabudowy', 'Встроенный холодильник',
        'ビルトイン冷凍冷蔵庫', '빌트인 냉장고', '嵌入式冰箱',
    ],
    'Oven Tower': [
        'Colonne four', 'Columna de horno', 'Fırın kulesi', 'Backofen-Hochschrank', 'Colonna forno',
        'Coluna de forno', 'Ovenkast', 'Słupek z piekarnikiem', 'Пенал с духовкой', 'オーブンタワー', '오븐 타워', '烤箱高柜',
    ],
    'Larder Unit': [
        'Colonne de rangement', 'Columna despensa', 'Kiler dolabı', 'Vorratshochschrank', 'Colonna dispensa',
        'Coluna despensa', 'Hoge voorraadkast', 'Słupek spiżarniany', 'Шкаф-пенал', 'パントリーユニット', '키 큰 수납장', '储物高柜',
    ],
    'Microwave Wall Cabinet': [
        'Meuble haut micro-ondes', 'Mueble alto con microondas', 'Mikrodalgalı üst dolap',
        'Hängeschrank mit Mikrowelle', 'Pensile con microonde', 'Armário superior com micro-ondas',
        'Bovenkast met magnetron', 'Szafka wisząca z mikrofalówką', 'Навесной шкаф с микроволновкой',
        '電子レンジ付き吊り戸棚', '전자레인지 상부장', '微波炉吊柜',
    ],
    'Extractor Hood': [
        'Hotte aspirante', 'Campana extractora', 'Davlumbaz', 'Dunstabzugshaube', 'Cappa aspirante', 'Exaustor',
        'Afzuigkap', 'Okap kuchenny', 'Вытяжка', 'レンジフード', '레인지 후드', '抽油烟机',
    ],
    'Open Shelf': [
        'Étagère ouverte', 'Estante abierto', 'Açık raf', 'Offenes Regal', 'Mensola a giorno', 'Prateleira aberta',
        'Open plank', 'Półka otwarta', 'Открытая полка', 'オープンシェルフ', '오픈 선반', '开放式搁板',
    ],
    'Open Niche': [
        'Niche ouverte', 'Nicho abierto', 'Açık niş', 'Offene Nische', 'Vano a giorno', 'Nicho aberto',
        'Open nis', 'Otwarta wnęka', 'Открытая ниша', 'オープンニッチ', '오픈 니치', '开放式壁龛',
    ],
    # ---- material library ----
    'Metal': [
        'Métal', 'Metal', 'Metal', 'Metall', 'Metallo', 'Metal', 'Metaal', 'Metal', 'Металл', '金属', '금속', '金属',
    ],
    'White Quartz': [
        'Quartz blanc', 'Cuarzo blanco', 'Beyaz kuvars', 'Weißer Quarz', 'Quarzo bianco', 'Quartzo branco',
        'Wit kwarts', 'Biały kwarc', 'Белый кварц', 'ホワイトクォーツ', '화이트 쿼츠', '白色石英石',
    ],
    'Black Granite': [
        'Granit noir', 'Granito negro', 'Siyah granit', 'Schwarzer Granit', 'Granito nero', 'Granito preto',
        'Zwart graniet', 'Czarny granit', 'Чёрный гранит', 'ブラックグラニット', '블랙 화강암', '黑色花岗岩',
    ],
    'Calacatta Marble': [
        'Marbre Calacatta', 'Mármol Calacatta', 'Calacatta mermer', 'Calacatta-Marmor', 'Marmo Calacatta',
        'Mármore Calacatta', 'Calacatta-marmer', 'Marmur Calacatta', 'Мрамор Калакатта', 'カラカッタ大理石', '칼라카타 대리석', '卡拉卡塔大理石',
    ],
    'Nero Marble': [
        'Marbre noir', 'Mármol negro', 'Siyah mermer', 'Schwarzer Marmor', 'Marmo nero', 'Mármore preto',
        'Zwart marmer', 'Czarny marmur', 'Чёрный мрамор', 'ネロ大理石', '블랙 대리석', '黑色大理石',
    ],
    'Travertine': [
        'Travertin', 'Travertino', 'Traverten', 'Travertin', 'Travertino', 'Travertino', 'Travertijn',
        'Trawertyn', 'Травертин', 'トラバーチン', '트래버틴', '洞石',
    ],
    'Dark Slate': [
        'Ardoise foncée', 'Pizarra oscura', 'Koyu arduaz', 'Dunkler Schiefer', 'Ardesia scura', 'Ardósia escura',
        'Donkere leisteen', 'Ciemny łupek', 'Тёмный сланец', 'ダークスレート', '다크 슬레이트', '深色板岩',
    ],
    'Terrazzo Slab': [
        'Dalle de terrazzo', 'Losa de terrazo', 'Terrazzo levha', 'Terrazzoplatte', 'Lastra di terrazzo',
        'Placa de terrazzo', 'Terrazzoplaat', 'Płyta lastryko', 'Плита терраццо', 'テラゾースラブ', '테라조 슬래브', '水磨石板',
    ],
    'Smooth Concrete': [
        'Béton lisse', 'Hormigón liso', 'Düz beton', 'Glatter Beton', 'Cemento liscio', 'Betão liso',
        'Glad beton', 'Gładki beton', 'Гладкий бетон', 'スムースコンクリート', '매끈한 콘크리트', '光面混凝土',
    ],
    'Oak Butcher Block': [
        'Chêne lamellé', 'Roble laminado', 'Meşe kasap tezgâhı', 'Eiche stabverleimt', 'Rovere lamellare',
        'Carvalho laminado', 'Eiken stavenblad', 'Dąb klejony', 'Дубовый щит', 'オーク集成材', '오크 집성목', '橡木拼板',
    ],
    'Brushed Steel': [
        'Acier brossé', 'Acero cepillado', 'Fırçalanmış çelik', 'Gebürsteter Stahl', 'Acciaio spazzolato',
        'Aço escovado', 'Geborsteld staal', 'Stal szczotkowana', 'Шлифованная сталь', 'ヘアライン仕上げスチール', '브러시드 스틸', '拉丝不锈钢',
    ],
    'White Hex Tile': [
        'Carrelage hexagonal blanc', 'Azulejo hexagonal blanco', 'Beyaz altıgen karo', 'Weiße Hexagonfliese',
        'Piastrella esagonale bianca', 'Azulejo hexagonal branco', 'Witte hexagontegel', 'Biała płytka heksagonalna',
        'Белая шестигранная плитка', 'ホワイト六角タイル', '화이트 헥사곤 타일', '白色六角砖',
    ],
    'Green Zellige': [
        'Zellige vert', 'Zellige verde', 'Yeşil zellige', 'Grüne Zellige', 'Zellige verde', 'Zellige verde',
        'Groene zellige', 'Zielone zellige', 'Зелёная плитка зеллиж', 'グリーンゼリージュ', '그린 젤리지 타일', '绿色手工砖',
    ],
}
for i, lang in enumerate(LANGS):
    path = os.path.join(ROOT, f'{lang}.ts')
    src = open(path, encoding='utf-8', newline='').read()
    nl = '\r\n' if '\r\n' in src else '\n'
    added = 0
    for key, vals in KEYS.items():
        assert len(vals) == 12, key
        assert "'" not in key and all("'" not in v for v in vals), key
        bare = key.isidentifier() and f'{nl}  {key}:' in src
        if bare or f"'{key}':" in src or f'"{key}":' in src:
            continue
        idx = src.rstrip().rfind('};')
        src = src[:idx] + f"  '{key}': '{vals[i]}',{nl}}};" + src.rstrip()[idx+2:] + nl
        added += 1
    open(path, 'w', encoding='utf-8', newline='').write(src)
    print(lang, added)
