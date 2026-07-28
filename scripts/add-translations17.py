# Batch 17: fences and railings (Phase C3) — the Fence card on a selected wall,
# the fence styles, and the fence drawing tool.
import os
LANGS = ['fr','es','tr','de','it','pt','nl','pl','ru','ja','ko','zh']
ROOT = os.path.join(os.path.dirname(__file__), '..', 'src', 'locales')
KEYS = {
  'Fence or railing': ['Clôture ou garde-corps','Valla o barandilla','Çit veya korkuluk','Zaun oder Geländer','Recinzione o ringhiera','Cerca ou guarda-corpo','Hek of leuning','Ogrodzenie lub balustrada','Забор или ограждение','フェンス・手すり','울타리 또는 난간','围栏或栏杆'],
  'Make this a garden fence, boundary or deck railing instead of a wall. It gets no roof and never encloses a room.': [
    'Transformez ce mur en clôture de jardin, limite de terrain ou garde-corps de terrasse. Il ne reçoit pas de toit et ne délimite jamais une pièce.',
    'Convierte esto en una valla de jardín, un lindero o una barandilla de terraza en lugar de un muro. No lleva tejado y nunca encierra una habitación.',
    'Bunu duvar yerine bahçe çiti, sınır veya teras korkuluğu yapın. Çatı almaz ve asla bir oda çevrelemez.',
    'Mach daraus statt einer Wand einen Gartenzaun, eine Grundstücksgrenze oder ein Terrassengeländer. Es bekommt kein Dach und umschließt nie einen Raum.',
    'Trasforma questo muro in una recinzione da giardino, un confine o una ringhiera per terrazza. Non riceve tetto e non delimita mai una stanza.',
    'Transforme isto em uma cerca de jardim, divisa ou guarda-corpo de deck em vez de uma parede. Não recebe telhado e nunca fecha um cômodo.',
    'Maak hiervan een tuinhek, erfgrens of terrasleuning in plaats van een muur. Het krijgt geen dak en sluit nooit een kamer af.',
    'Zamień to w ogrodzenie ogrodowe, granicę działki lub balustradę tarasu zamiast ściany. Nie dostaje dachu i nigdy nie zamyka pomieszczenia.',
    'Сделайте это садовым забором, границей участка или ограждением террасы вместо стены. Крыши не получает и никогда не образует комнату.',
    'これを壁ではなく庭のフェンス・敷地境界・デッキの手すりにします。屋根は付かず、部屋を囲むこともありません。',
    '이것을 벽이 아니라 정원 울타리, 경계 또는 데크 난간으로 만듭니다. 지붕이 생기지 않고 방을 둘러싸지도 않습니다.',
    '把这段变成花园围栏、地界或露台栏杆，而不是墙。它不会有屋顶，也永远不会围成房间。',
  ],
  'Fence': ['Clôture','Valla','Çit','Zaun','Recinzione','Cerca','Hek','Ogrodzenie','Забор','フェンス','울타리','围栏'],
  'Picket': ['Palissade','Estacas','Ahşap parmaklık','Lattenzaun','Steccato','Estacas','Schuttinglat','Sztachety','Штакетник','ピケット','피켓','尖桩'],
  'Privacy': ['Occultante','Opaca','Gizlilik','Sichtschutz','Frangivista','Privacidade','Privacy','Pełne','Глухой','目隠し','프라이버시','隐私'],
  'Post and rail': ['Poteaux et lisses','Postes y travesaños','Direk ve kuşak','Pfosten und Riegel','Pali e traverse','Mourões e travessas','Palen en liggers','Słupki i żerdzie','Столбы и жерди','横木柵','기둥과 가로대','横栏'],
  'Railing': ['Garde-corps','Barandilla','Korkuluk','Geländer','Ringhiera','Guarda-corpo','Leuning','Balustrada','Ограждение','手すり','난간','栏杆'],
  'Draw fence': ['Tracer une clôture','Dibujar valla','Çit çiz','Zaun zeichnen','Disegna recinzione','Desenhar cerca','Hek tekenen','Rysuj ogrodzenie','Нарисовать забор','フェンスを描く','울타리 그리기','绘制围栏'],
  'Click to run a fence line — pick its style and height in Properties once drawn': [
    'Cliquez pour tracer une ligne de clôture — choisissez son style et sa hauteur dans Propriétés une fois tracée',
    'Haz clic para trazar una línea de valla; elige su estilo y altura en Propiedades cuando esté dibujada',
    'Çit hattını çizmek için tıklayın — çizdikten sonra stilini ve yüksekliğini Özellikler’den seçin',
    'Klicke, um eine Zaunlinie zu ziehen — Stil und Höhe wählst du danach in den Eigenschaften',
    'Fai clic per tracciare una linea di recinzione: scegli stile e altezza in Proprietà una volta disegnata',
    'Clique para traçar uma linha de cerca — escolha o estilo e a altura em Propriedades depois de desenhada',
    'Klik om een heklijn te trekken — kies stijl en hoogte in Eigenschappen zodra het getekend is',
    'Kliknij, aby poprowadzić linię ogrodzenia — styl i wysokość wybierzesz we Właściwościach po narysowaniu',
    'Щёлкайте, чтобы провести линию забора — стиль и высоту выберите в «Свойствах» после отрисовки',
    'クリックしてフェンスの線を引きます。描いた後にプロパティでスタイルと高さを選べます',
    '클릭해서 울타리 선을 그으세요. 그린 뒤 속성에서 스타일과 높이를 고를 수 있습니다',
    '点击拉出围栏线——画好后在“属性”中选择样式和高度',
  ],
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
print('batch17 (fences) done')
