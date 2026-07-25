# Batch 12: roof card (Properties) + roof coverings.
import os
LANGS = ['fr','es','tr','de','it','pt','nl','pl','ru','ja','ko','zh']
ROOT = os.path.join(os.path.dirname(__file__), '..', 'src', 'locales')
KEYS = {
  'Roof': ['Toit','Tejado','Çatı','Dach','Tetto','Telhado','Dak','Dach','Крыша','屋根','지붕','屋顶'],
  'Add roof': ['Ajouter un toit','Añadir tejado','Çatı ekle','Dach hinzufügen','Aggiungi tetto','Adicionar telhado','Dak toevoegen','Dodaj dach','Добавить крышу','屋根を追加','지붕 추가','添加屋顶'],
  'Remove roof': ['Supprimer le toit','Quitar tejado','Çatıyı kaldır','Dach entfernen','Rimuovi tetto','Remover telhado','Dak verwijderen','Usuń dach','Удалить крышу','屋根を削除','지붕 삭제','移除屋顶'],
  'Cover the building with a roof, built from your outer walls.': [
    'Couvrez le bâtiment d’un toit, construit à partir de vos murs extérieurs.',
    'Cubre el edificio con un tejado generado a partir de tus muros exteriores.',
    'Binayı dış duvarlarınızdan oluşturulan bir çatıyla kaplayın.',
    'Deckt das Gebäude mit einem Dach ab, erzeugt aus deinen Außenwänden.',
    'Copri l’edificio con un tetto generato dai muri perimetrali.',
    'Cubra o edifício com um telhado gerado a partir das paredes externas.',
    'Dek het gebouw af met een dak, gemaakt op basis van je buitenmuren.',
    'Przykryj budynek dachem utworzonym na podstawie ścian zewnętrznych.',
    'Накройте здание крышей, построенной по внешним стенам.',
    '外壁から生成した屋根で建物を覆います。',
    '외벽을 기준으로 만든 지붕으로 건물을 덮습니다.',
    '用根据外墙自动生成的屋顶覆盖建筑。',
  ],
  'This footprint is not rectangular enough for a pitched roof, so a flat roof is drawn instead.': [
    'Cette emprise n’est pas assez rectangulaire pour un toit en pente : un toit plat est dessiné à la place.',
    'Esta planta no es lo bastante rectangular para un tejado inclinado, así que se dibuja uno plano.',
    'Bu taban alanı eğimli çatı için yeterince dikdörtgen değil, bu yüzden düz çatı çizilir.',
    'Dieser Grundriss ist für ein Schrägdach nicht rechteckig genug — es wird ein Flachdach gezeichnet.',
    'Questa pianta non è abbastanza rettangolare per un tetto a falde: viene disegnato un tetto piano.',
    'Esta planta não é retangular o suficiente para um telhado inclinado, então um telhado plano é desenhado.',
    'Deze plattegrond is niet rechthoekig genoeg voor een schuin dak; er wordt een plat dak getekend.',
    'Ten rzut nie jest wystarczająco prostokątny na dach spadzisty — rysowany jest dach płaski.',
    'Этот контур недостаточно прямоугольный для скатной крыши — построена плоская.',
    'この外形は勾配屋根には長方形に近くないため、陸屋根を描画します。',
    '이 평면은 경사 지붕을 올리기에 충분히 직사각형이 아니어서 평지붕으로 그립니다.',
    '此平面不够接近矩形，无法生成坡屋顶，因此改用平屋顶。',
  ],
  'Gable': ['Deux pentes','A dos aguas','Beşik','Satteldach','A capanna','Duas águas','Zadeldak','Dwuspadowy','Двускатная','切妻','박공','双坡'],
  'Hip': ['Quatre pentes','A cuatro aguas','Kırma','Walmdach','A padiglione','Quatro águas','Schilddak','Kopertowy','Вальмовая','寄棟','모임','四坡'],
  'Shed': ['Monopente','Un agua','Tek eğimli','Pultdach','A falda unica','Uma água','Lessenaarsdak','Jednospadowy','Односкатная','片流れ','외쪽','单坡'],
  'Flat': ['Plat','Plano','Düz','Flach','Piano','Plano','Plat','Płaski','Плоская','陸屋根','평지붕','平顶'],
  'Pitch': ['Pente','Pendiente','Eğim','Neigung','Pendenza','Inclinação','Helling','Nachylenie','Уклон','勾配','경사','坡度'],
  'Overhang': ['Débord','Alero','Saçak','Überstand','Sporgenza','Beiral','Overstek','Okap','Свес','軒の出','처마','出檐'],
  'Covering': ['Couverture','Cubierta','Kaplama','Deckung','Manto','Cobertura','Bedekking','Pokrycie','Покрытие','葺き材','마감재','覆面材料'],
  'Clay Tile': ['Tuile terre cuite','Teja de barro','Kil kiremit','Tonziegel','Tegola in cotto','Telha cerâmica','Dakpan (klei)','Dachówka ceramiczna','Глиняная черепица','素焼き瓦','점토 기와','黏土瓦'],
  'Grey Tile': ['Tuile grise','Teja gris','Gri kiremit','Grauer Ziegel','Tegola grigia','Telha cinza','Grijze dakpan','Dachówka szara','Серая черепица','グレー瓦','회색 기와','灰色瓦'],
  'Slate': ['Ardoise','Pizarra','Arduvaz','Schiefer','Ardesia','Ardósia','Leisteen','Łupek','Сланец','スレート','슬레이트','石板'],
  'Shingle': ['Bardeau','Teja asfáltica','Shingle','Schindel','Scandola','Telha shingle','Shingle','Gont','Гонт','シングル','슁글','沥青瓦'],
  'Cedar Shake': ['Bardeau de cèdre','Tabla de cedro','Sedir shake','Zedernschindel','Scandola di cedro','Telha de cedro','Cederhouten shake','Gont cedrowy','Кедровый гонт','シダーシェイク','시더 셰이크','雪松木瓦'],
  'Standing Seam': ['Joint debout','Junta alzada','Dik dikiş','Stehfalz','Aggraffatura','Junta vertical','Felsdak','Rąbek stojący','Фальцевая кровля','立平葺き','거멀접기','立缝金属'],
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
print('batch12 done')
