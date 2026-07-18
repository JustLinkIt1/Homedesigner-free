# Batch 2: recent UI strings (lock, kitchen-run tool) + sample room names.
import re, os
LANGS = ['fr','es','tr','de','it','pt','nl','pl','ru','ja','ko','zh']
ROOT = os.path.join(os.path.dirname(__file__), '..', 'src', 'locales')
T = {
'Lock': ['Verrou','Bloqueo','Kilit','Sperren','Blocco','Bloquear','Vergrendel','Blokada','Блок','ロック','잠금','锁定'],
'Lock objects': ['Verrouiller les objets','Bloquear objetos','Nesneleri kilitle','Objekte sperren','Blocca oggetti','Bloquear objetos','Objecten vergrendelen','Zablokuj obiekty','Заблокировать объекты','オブジェクトをロック','객체 잠금','锁定对象'],
'Lock objects so they cannot be moved': ['Verrouiller les objets pour qu’ils ne puissent pas bouger','Bloquear los objetos para que no se muevan','Nesneleri taşınamamaları için kilitle','Objekte sperren, damit sie nicht verschoben werden','Blocca gli oggetti per impedirne lo spostamento','Bloquear os objetos para que não se movam','Objecten vergrendelen zodat ze niet verplaatst kunnen worden','Zablokuj obiekty, aby nie można ich było przesuwać','Заблокировать объекты, чтобы их нельзя было двигать','オブジェクトを固定して動かせないようにする','객체가 움직이지 않도록 잠급니다','锁定对象，防止被移动'],
'Kitchen run': ['Ligne de cuisine','Línea de cocina','Mutfak hattı','Küchenzeile','Cucina lineare','Linha de cozinha','Keukenblok','Ciąg kuchenny','Кухонная линия','キッチンライン','주방 라인','橱柜排布'],
'Wall cabinets': ['Meubles hauts','Muebles altos','Üst dolaplar','Hängeschränke','Pensili','Armários superiores','Bovenkasten','Szafki górne','Навесные шкафы','吊り戸棚','상부장','吊柜'],
'Also add wall cabinets above the counter': ['Ajouter aussi des meubles hauts au-dessus du plan de travail','Añadir también muebles altos sobre la encimera','Tezgahın üstüne üst dolaplar da ekle','Auch Hängeschränke über der Arbeitsplatte hinzufügen','Aggiungi anche i pensili sopra il piano','Adicionar também armários superiores sobre a bancada','Ook bovenkasten boven het aanrecht plaatsen','Dodaj też szafki górne nad blatem','Также добавить навесные шкафы над столешницей','カウンター上に吊り戸棚も追加','조리대 위에 상부장도 추가','同时在台面上方添加吊柜'],
'Click along a wall, then click again — base cabinets tile the run and face the room': ['Cliquez le long d’un mur, puis cliquez à nouveau — les meubles bas remplissent la ligne, face à la pièce','Haz clic a lo largo de una pared y luego otra vez: los muebles bajos rellenan la línea mirando a la habitación','Bir duvar boyunca tıklayın, sonra tekrar tıklayın — alt dolaplar hattı doldurur ve odaya bakar','Entlang einer Wand klicken, dann erneut — Unterschränke füllen die Zeile und zeigen zum Raum','Clicca lungo un muro, poi di nuovo — i mobili base riempiono la linea rivolti verso la stanza','Clique ao longo de uma parede e depois outra vez — os armários preenchem a linha virados para a divisão','Klik langs een muur en dan nogmaals — onderkasten vullen de rij en kijken de kamer in','Kliknij wzdłuż ściany, potem ponownie — szafki dolne wypełnią ciąg przodem do pokoju','Кликните вдоль стены, затем ещё раз — нижние шкафы заполнят линию лицом в комнату','壁に沿ってクリックし、もう一度クリック — ベースキャビネットが並び、部屋側を向きます','벽을 따라 클릭 후 다시 클릭 — 하부장이 줄지어 방을 향합니다','沿墙点击，再点击一次——地柜将排满并面向房间'],
'Dining Room': ['Salle à manger','Comedor','Yemek odası','Esszimmer','Sala da pranzo','Sala de jantar','Eetkamer','Jadalnia','Столовая','ダイニングルーム','다이닝룸','餐厅'],
'Great Room': ['Grande pièce à vivre','Sala principal','Ana oda','Wohnbereich','Zona giorno','Sala principal','Grote woonruimte','Salon główny','Гостиная-студия','リビング','거실','大客厅'],
'Hall': ['Entrée','Recibidor','Hol','Diele','Ingresso','Hall','Hal','Przedpokój','Холл','ホール','현관','门厅'],
'Hallway': ['Couloir','Pasillo','Koridor','Flur','Corridoio','Corredor','Gang','Korytarz','Коридор','廊下','복도','走廊'],
'Kids Room': ['Chambre d’enfant','Habitación infantil','Çocuk odası','Kinderzimmer','Cameretta','Quarto das crianças','Kinderkamer','Pokój dziecięcy','Детская','子供部屋','아이 방','儿童房'],
'Kitchen & Dining': ['Cuisine et salle à manger','Cocina y comedor','Mutfak ve yemek','Küche & Essbereich','Cucina e pranzo','Cozinha e sala de jantar','Keuken & eethoek','Kuchnia i jadalnia','Кухня-столовая','キッチン＆ダイニング','주방 & 다이닝','厨房与餐厅'],
'Landing': ['Palier','Rellano','Sahanlık','Treppenabsatz','Pianerottolo','Patamar','Overloop','Podest','Лестничная площадка','踊り場','층계참','楼梯平台'],
'Living Room': ['Salon','Sala de estar','Oturma odası','Wohnzimmer','Soggiorno','Sala de estar','Woonkamer','Salon','Гостиная','リビングルーム','거실','客厅'],
'Master Bedroom': ['Chambre principale','Dormitorio principal','Ana yatak odası','Hauptschlafzimmer','Camera padronale','Quarto principal','Hoofdslaapkamer','Sypialnia główna','Главная спальня','主寝室','안방','主卧'],
'Studio': ['Studio','Estudio','Stüdyo','Studio','Monolocale','Estúdio','Studio','Kawalerka','Студия','スタジオ','스튜디오','单间公寓'],
'Terrace': ['Terrasse','Terraza','Teras','Terrasse','Terrazza','Terraço','Terras','Taras','Терраса','テラス','테라스','露台'],
'WC': ['WC','Aseo','WC','WC','WC','WC','Wc','WC','Санузел','トイレ','화장실','卫生间'],
'Room': ['Pièce','Habitación','Oda','Raum','Stanza','Divisão','Kamer','Pokój','Комната','部屋','방','房间'],
}
added = {}
for i, lang in enumerate(LANGS):
    path = os.path.join(ROOT, f'{lang}.ts')
    src = open(path, encoding='utf-8').read()
    lines = []
    for key, vals in T.items():
        v = vals[i]
        qkey = key.replace('\\', '\\\\').replace("'", "\\'")
        qval = v.replace('\\', '\\\\').replace("'", "\\'")
        if f"'{qkey}':" in src or re.search(rf"^\s+{re.escape(key)}: ", src, re.M):
            continue
        lines.append(f"  '{qkey}': '{qval}',")
    if lines:
        block = "\n  /* ---------- Lock, kitchen tool & room names (v1.0.53) ---------- */\n" + "\n".join(lines) + "\n};"
        idx = src.rstrip().rfind('};')
        src = src[:idx] + block + src.rstrip()[idx+2:] + '\n'
        open(path, 'w', encoding='utf-8').write(src)
    added[lang] = len(lines)
print('batch2 added:', added)
