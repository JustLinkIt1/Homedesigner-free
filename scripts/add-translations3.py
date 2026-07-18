# Batch 3: the Properties empty-state paragraph.
import re, os
LANGS = ['fr','es','tr','de','it','pt','nl','pl','ru','ja','ko','zh']
ROOT = os.path.join(os.path.dirname(__file__), '..', 'src', 'locales')
KEY = 'Pick a wall, room or object to edit it. Or import a plan, then auto-detect rooms and start decorating.'
VALS = [
'Touchez un mur, une pièce ou un objet pour le modifier. Ou importez un plan, détectez les pièces automatiquement et commencez à décorer.',
'Toca una pared, habitación u objeto para editarlo. O importa un plano, detecta las habitaciones automáticamente y empieza a decorar.',
'Düzenlemek için bir duvara, odaya veya nesneye dokunun. Ya da bir plan içe aktarın, odaları otomatik algılayın ve dekorasyona başlayın.',
'Wähle eine Wand, einen Raum oder ein Objekt zum Bearbeiten. Oder importiere einen Plan, erkenne Räume automatisch und beginne mit dem Einrichten.',
'Tocca un muro, una stanza o un oggetto per modificarlo. Oppure importa una planimetria, rileva le stanze e inizia a decorare.',
'Toque numa parede, divisão ou objeto para o editar. Ou importe uma planta, detete as divisões automaticamente e comece a decorar.',
'Kies een muur, kamer of object om te bewerken. Of importeer een plattegrond, detecteer kamers automatisch en begin met inrichten.',
'Wybierz ścianę, pokój lub obiekt, aby go edytować. Możesz też zaimportować plan, automatycznie wykryć pokoje i zacząć urządzać.',
'Выберите стену, комнату или объект для редактирования. Или импортируйте план, автоматически распознайте комнаты и начните оформление.',
'壁・部屋・オブジェクトを選んで編集します。または図面をインポートして部屋を自動検出し、装飾を始めましょう。',
'벽, 방 또는 객체를 선택해 편집하세요. 또는 도면을 가져와 방을 자동 인식하고 꾸미기를 시작하세요.',
'点击墙、房间或对象进行编辑。也可以导入平面图，自动识别房间后开始装饰。',
]
for i, lang in enumerate(LANGS):
    path = os.path.join(ROOT, f'{lang}.ts')
    src = open(path, encoding='utf-8').read()
    qkey = KEY.replace("'", "\\'")
    if f"'{qkey}':" in src:
        continue
    qval = VALS[i].replace("'", "\\'")
    idx = src.rstrip().rfind('};')
    src = src[:idx] + f"  '{qkey}': '{qval}',\n}};" + src.rstrip()[idx+2:] + '\n'
    open(path, 'w', encoding='utf-8').write(src)
print('batch3 done')
