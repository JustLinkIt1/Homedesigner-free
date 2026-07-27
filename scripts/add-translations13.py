# Batch 13: whole-plan rotation card + the 2D context menu (which had shipped
# hardcoded in English on every locale).
import os
LANGS = ['fr','es','tr','de','it','pt','nl','pl','ru','ja','ko','zh']
ROOT = os.path.join(os.path.dirname(__file__), '..', 'src', 'locales')
KEYS = {
  # ---- context menu ----
  'Copy': ['Copier','Copiar','Kopyala','Kopieren','Copia','Copiar','Kopiëren','Kopiuj','Копировать','コピー','복사','复制'],
  'Paste': ['Coller','Pegar','Yapıştır','Einfügen','Incolla','Colar','Plakken','Wklej','Вставить','貼り付け','붙여넣기','粘贴'],
  'Select all': ['Tout sélectionner','Seleccionar todo','Tümünü seç','Alles auswählen','Seleziona tutto','Selecionar tudo','Alles selecteren','Zaznacz wszystko','Выделить все','すべて選択','모두 선택','全选'],
  'Bring to front': ['Mettre au premier plan','Traer al frente','Öne getir','In den Vordergrund','Porta in primo piano','Trazer para a frente','Naar voren halen','Przenieś na wierzch','На передний план','最前面へ','맨 앞으로','置于顶层'],
  'Send to back': ['Mettre à l’arrière-plan','Enviar al fondo','Arkaya gönder','In den Hintergrund','Porta in fondo','Enviar para trás','Naar achteren sturen','Przenieś na spód','На задний план','最背面へ','맨 뒤로','置于底层'],
  # Lowercase nouns — these are interpolated into "Delete <noun>", matching the
  # existing lowercase 'room' key.
  'items': ['éléments','elementos','öğe','Objekte','elementi','itens','items','elementy','объектов','個のアイテム','개 항목','个对象'],
  'furniture': ['meuble','mueble','mobilya','Möbel','mobile','móvel','meubel','mebel','объект','家具','가구','家具'],
  'wall': ['mur','muro','duvar','Wand','muro','parede','muur','ścianę','стену','壁','벽','墙'],
  'opening': ['ouverture','abertura','açıklık','Öffnung','apertura','abertura','opening','otwór','проём','開口部','개구부','洞口'],
  # ---- plan card ----
  'Plan': ['Plan','Plano','Plan','Grundriss','Pianta','Planta','Plattegrond','Rzut','План','間取り','평면','平面图'],
  'Rotate': ['Pivoter','Girar','Döndür','Drehen','Ruota','Girar','Draaien','Obróć','Повернуть','回転','회전','旋转'],
  'Rotate 90° left': ['Pivoter de 90° à gauche','Girar 90° a la izquierda','90° sola döndür','90° nach links drehen','Ruota di 90° a sinistra','Girar 90° à esquerda','90° naar links draaien','Obróć o 90° w lewo','Повернуть на 90° влево','左に90°回転','왼쪽으로 90° 회전','向左旋转90°'],
  'Rotate 90° right': ['Pivoter de 90° à droite','Girar 90° a la derecha','90° sağa döndür','90° nach rechts drehen','Ruota di 90° a destra','Girar 90° à direita','90° naar rechts draaien','Obróć o 90° w prawo','Повернуть на 90° вправо','右に90°回転','오른쪽으로 90° 회전','向右旋转90°'],
  'Turn the whole plan — every storey rotates together.': [
    'Faites pivoter tout le plan — tous les étages tournent ensemble.',
    'Gira el plano completo: todas las plantas giran a la vez.',
    'Tüm planı döndürün — bütün katlar birlikte döner.',
    'Dreh den gesamten Grundriss — alle Geschosse drehen sich mit.',
    'Ruota l’intera pianta: tutti i piani ruotano insieme.',
    'Gire a planta inteira — todos os pavimentos giram juntos.',
    'Draai de hele plattegrond — alle verdiepingen draaien mee.',
    'Obróć cały rzut — wszystkie kondygnacje obracają się razem.',
    'Поверните весь план — все этажи поворачиваются вместе.',
    '間取り全体を回転します。すべての階が一緒に回ります。',
    '평면 전체를 회전합니다. 모든 층이 함께 돌아갑니다.',
    '旋转整个平面图 — 所有楼层一起旋转。',
  ],
}
for i, lang in enumerate(LANGS):
    path = os.path.join(ROOT, f'{lang}.ts')
    src = open(path, encoding='utf-8').read()
    added = 0
    for key, vals in KEYS.items():
        assert len(vals) == 12, key
        qkey = key.replace("'", "\\'")
        # Locale files carry identifier-safe keys unquoted (Delete: '...'), so
        # check that form too or we'd append a duplicate key for e.g. 'Copy'.
        bare = key.isidentifier() and f'\n  {key}:' in src
        if bare or f"'{qkey}':" in src or f'"{key}":' in src:
            continue
        qval = vals[i].replace("'", "\\'")
        idx = src.rstrip().rfind('};')
        src = src[:idx] + f"  '{qkey}': '{qval}',\n}};" + src.rstrip()[idx+2:] + '\n'
        added += 1
    open(path, 'w', encoding='utf-8').write(src)
    print(lang, added)
print('batch13 done')
