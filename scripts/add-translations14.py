# Batch 14: the first-run tour (expanded) and the whole Tips & shortcuts panel,
# which had shipped entirely in English — it is what the home screen's
# "Need inspiration? → Explore ideas" button opens, so non-English users landed
# on a wall of English.
import os
LANGS = ['fr','es','tr','de','it','pt','nl','pl','ru','ja','ko','zh']
ROOT = os.path.join(os.path.dirname(__file__), '..', 'src', 'locales')
KEYS = {
  # ---- shared tour/panel chrome ----
  'Skip': ['Passer','Omitir','Atla','Überspringen','Salta','Pular','Overslaan','Pomiń','Пропустить','スキップ','건너뛰기','跳过'],
  'Next': ['Suivant','Siguiente','İleri','Weiter','Avanti','Próximo','Volgende','Dalej','Далее','次へ','다음','下一步'],
  'Got it': ['Compris','Entendido','Anladım','Alles klar','Ho capito','Entendi','Begrepen','Rozumiem','Понятно','わかりました','확인','知道了'],
  'Show intro again': ['Revoir l’intro','Ver la intro otra vez','Tanıtımı tekrar göster','Intro erneut zeigen','Rivedi l’introduzione','Ver a introdução de novo','Intro opnieuw tonen','Pokaż wprowadzenie ponownie','Показать вступление снова','イントロを再表示','소개 다시 보기','再次显示介绍'],
  'Tips & shortcuts': ['Astuces et raccourcis','Consejos y atajos','İpuçları ve kısayollar','Tipps & Tastenkürzel','Suggerimenti e scorciatoie','Dicas e atalhos','Tips en sneltoetsen','Wskazówki i skróty','Советы и горячие клавиши','ヒントとショートカット','팁 및 단축키','提示与快捷键'],
  'Tips & gestures': ['Astuces et gestes','Consejos y gestos','İpuçları ve hareketler','Tipps & Gesten','Suggerimenti e gesti','Dicas e gestos','Tips en gebaren','Wskazówki i gesty','Советы и жесты','ヒントとジェスチャー','팁 및 제스처','提示与手势'],
  'Rotate plan': ['Pivoter le plan','Girar el plano','Planı döndür','Grundriss drehen','Ruota la pianta','Girar a planta','Plattegrond draaien','Obróć rzut','Повернуть план','間取りを回転','평면 회전','旋转平面图'],

  # ---- new tour steps ----
  'Start from a real plan': ['Partez d’un vrai plan','Empieza con un plano real','Gerçek bir plandan başlayın','Mit einem echten Plan starten','Parti da una pianta reale','Comece com uma planta real','Begin met een echte plattegrond','Zacznij od prawdziwego rzutu','Начните с настоящего плана','実際の図面から始める','실제 도면에서 시작','从真实图纸开始'],
  'Import a PDF, image, DXF or DWG and HomeDesigner traces the walls for you — then set the scale from one known length.': [
    'Importez un PDF, une image, un DXF ou un DWG : HomeDesigner trace les murs pour vous, puis définissez l’échelle à partir d’une longueur connue.',
    'Importa un PDF, imagen, DXF o DWG y HomeDesigner traza los muros por ti; luego fija la escala con una longitud conocida.',
    'PDF, görsel, DXF veya DWG içe aktarın; HomeDesigner duvarları sizin için çizer, ardından bilinen bir uzunlukla ölçeği ayarlayın.',
    'Importiere ein PDF, Bild, DXF oder DWG — HomeDesigner zeichnet die Wände nach, danach legst du den Maßstab über eine bekannte Länge fest.',
    'Importa un PDF, un’immagine, un DXF o un DWG: HomeDesigner traccia i muri per te, poi imposta la scala da una lunghezza nota.',
    'Importe um PDF, imagem, DXF ou DWG e o HomeDesigner traça as paredes por você; depois defina a escala por um comprimento conhecido.',
    'Importeer een PDF, afbeelding, DXF of DWG en HomeDesigner trekt de muren over — stel daarna de schaal in met één bekende lengte.',
    'Zaimportuj PDF, obraz, DXF lub DWG — HomeDesigner obrysuje ściany, a potem ustaw skalę na podstawie znanej długości.',
    'Импортируйте PDF, изображение, DXF или DWG — HomeDesigner обведёт стены, затем задайте масштаб по известной длине.',
    'PDF・画像・DXF・DWG を読み込むと壁を自動でトレースします。既知の長さから縮尺を設定してください。',
    'PDF, 이미지, DXF, DWG를 가져오면 벽을 자동으로 추적합니다. 이후 알고 있는 길이로 축척을 설정하세요.',
    '导入 PDF、图片、DXF 或 DWG，HomeDesigner 会自动描出墙体，然后用一段已知长度设定比例。',
  ],
  'Turn walls into rooms': ['Transformez les murs en pièces','Convierte muros en habitaciones','Duvarları odalara dönüştürün','Aus Wänden Räume machen','Trasforma i muri in stanze','Transforme paredes em cômodos','Maak kamers van muren','Zamień ściany w pomieszczenia','Превратите стены в комнаты','壁から部屋を作る','벽을 방으로 만들기','把墙变成房间'],
  'Once your walls form closed loops, Auto-detect rooms fills them in so you can floor, paint and furnish each one.': [
    'Dès que vos murs forment des boucles fermées, « Détection auto » crée les pièces : vous pouvez alors poser le sol, peindre et meubler.',
    'Cuando tus muros formen bucles cerrados, «Detectar habitaciones» las rellena para que puedas poner suelo, pintar y amueblar.',
    'Duvarlarınız kapalı halkalar oluşturduğunda, «Odaları otomatik bul» onları doldurur; zemin, boya ve mobilya ekleyebilirsiniz.',
    'Sobald deine Wände geschlossene Umrisse bilden, füllt „Räume erkennen“ sie aus — dann kannst du Boden, Farbe und Möbel wählen.',
    'Quando i muri formano anelli chiusi, «Rileva stanze» le crea: potrai posare il pavimento, dipingere e arredare.',
    'Quando suas paredes formarem laços fechados, «Detectar cômodos» os preenche para você pôr piso, pintar e mobiliar.',
    'Zodra je muren gesloten lussen vormen, vult «Kamers detecteren» ze in, zodat je vloer, verf en meubels kunt kiezen.',
    'Gdy ściany utworzą zamknięte pętle, «Wykryj pomieszczenia» je wypełni — możesz kłaść podłogi, malować i umeblować.',
    'Когда стены образуют замкнутые контуры, «Определить комнаты» заполнит их — можно стелить пол, красить и обставлять.',
    '壁が閉じたループになると「部屋を自動検出」で部屋ができ、床・塗装・家具を設定できます。',
    '벽이 닫힌 고리를 이루면 「방 자동 감지」가 방을 만들어 바닥, 페인트, 가구를 넣을 수 있습니다.',
    '当墙体围成闭合回路后，“自动识别房间”会生成房间，便可铺地板、刷漆和布置家具。',
  ],
  'Edit anything you select': ['Modifiez ce que vous sélectionnez','Edita lo que selecciones','Seçtiğiniz her şeyi düzenleyin','Alles Ausgewählte bearbeiten','Modifica ciò che selezioni','Edite o que selecionar','Bewerk wat je selecteert','Edytuj to, co zaznaczysz','Редактируйте выбранное','選択したものを編集','선택한 항목 편집','编辑所选对象'],
  'Select a wall, room or object to change its size, height, colour and material. With nothing selected you get whole-home controls: exterior cladding, the roof, and rotating the plan.': [
    'Sélectionnez un mur, une pièce ou un objet pour changer taille, hauteur, couleur et matériau. Sans sélection, vous obtenez les réglages globaux : façade, toit et rotation du plan.',
    'Selecciona un muro, habitación u objeto para cambiar tamaño, altura, color y material. Sin selección aparecen los controles globales: fachada, tejado y giro del plano.',
    'Boyut, yükseklik, renk ve malzeme için bir duvar, oda veya nesne seçin. Hiçbir şey seçili değilken tüm ev kontrolleri çıkar: dış cephe, çatı ve planı döndürme.',
    'Wähle eine Wand, einen Raum oder ein Objekt, um Größe, Höhe, Farbe und Material zu ändern. Ohne Auswahl erscheinen die Haus-Regler: Fassade, Dach und Grundriss drehen.',
    'Seleziona un muro, una stanza o un oggetto per cambiarne dimensioni, altezza, colore e materiale. Senza selezione compaiono i controlli globali: rivestimento esterno, tetto e rotazione della pianta.',
    'Selecione uma parede, cômodo ou objeto para mudar tamanho, altura, cor e material. Sem seleção aparecem os controles da casa: revestimento externo, telhado e girar a planta.',
    'Selecteer een muur, kamer of object om formaat, hoogte, kleur en materiaal te wijzigen. Zonder selectie krijg je woningbrede knoppen: gevel, dak en plattegrond draaien.',
    'Zaznacz ścianę, pomieszczenie lub obiekt, aby zmienić rozmiar, wysokość, kolor i materiał. Bez zaznaczenia pojawią się ustawienia całego domu: elewacja, dach i obrót rzutu.',
    'Выберите стену, комнату или объект, чтобы изменить размер, высоту, цвет и материал. Без выделения доступны настройки всего дома: облицовка, крыша и поворот плана.',
    '壁・部屋・オブジェクトを選ぶとサイズ、高さ、色、素材を変更できます。何も選ばないと外壁・屋根・間取りの回転など家全体の設定が表示されます。',
    '벽, 방, 오브젝트를 선택하면 크기·높이·색상·재질을 바꿀 수 있습니다. 아무것도 선택하지 않으면 외벽, 지붕, 평면 회전 등 집 전체 설정이 나타납니다.',
    '选中墙体、房间或物件即可修改尺寸、高度、颜色和材质。未选中任何对象时会显示整屋设置：外墙、屋顶和旋转平面图。',
  ],
  'Add more storeys': ['Ajoutez des étages','Añade más plantas','Kat ekleyin','Weitere Geschosse','Aggiungi altri piani','Adicione mais pavimentos','Voeg verdiepingen toe','Dodaj kolejne kondygnacje','Добавьте этажи','階を追加する','층 추가하기','添加更多楼层'],
  'Build upstairs and down, copy a floor to reuse its layout, and see the whole house stacked in 3D.': [
    'Construisez à l’étage et au sous-sol, copiez un niveau pour réutiliser son plan, et voyez toute la maison empilée en 3D.',
    'Construye arriba y abajo, copia una planta para reutilizar su distribución y ve la casa entera apilada en 3D.',
    'Üst ve alt katları kurun, düzeni yeniden kullanmak için bir katı kopyalayın ve tüm evi 3B’de üst üste görün.',
    'Baue nach oben und unten, kopiere ein Geschoss, um seinen Grundriss wiederzuverwenden, und sieh das ganze Haus gestapelt in 3D.',
    'Costruisci sopra e sotto, copia un piano per riusarne la disposizione e vedi tutta la casa impilata in 3D.',
    'Construa em cima e embaixo, copie um pavimento para reaproveitar o layout e veja a casa inteira empilhada em 3D.',
    'Bouw omhoog en omlaag, kopieer een verdieping om de indeling te hergebruiken en zie het hele huis gestapeld in 3D.',
    'Buduj w górę i w dół, skopiuj kondygnację, by użyć jej układu ponownie, i zobacz cały dom w 3D.',
    'Стройте вверх и вниз, копируйте этаж, чтобы повторить планировку, и смотрите весь дом в 3D.',
    '上階も地下も作れます。階をコピーして間取りを再利用し、家全体を 3D で積み上げて確認できます。',
    '위층과 아래층을 만들고, 층을 복사해 배치를 재사용하며, 집 전체를 3D로 쌓아 볼 수 있습니다.',
    '可向上或向下加层，复制楼层以重用布局，并在 3D 中查看整栋房子的堆叠效果。',
  ],
  'Share the finished home': ['Partagez la maison finie','Comparte la casa terminada','Bitmiş evi paylaşın','Das fertige Haus teilen','Condividi la casa finita','Compartilhe a casa pronta','Deel het afgeronde huis','Udostępnij gotowy dom','Поделитесь готовым домом','完成した家を共有','완성한 집 공유하기','分享完成的家'],
  'Export a print-ready PDF or a layered DXF for CAD, render a photo of any view, or send a shopping list of everything you placed.': [
    'Exportez un PDF prêt à imprimer ou un DXF calqué pour la CAO, rendez une photo de n’importe quelle vue, ou envoyez la liste d’achats de tout ce que vous avez placé.',
    'Exporta un PDF listo para imprimir o un DXF por capas para CAD, renderiza una foto de cualquier vista o envía la lista de la compra de todo lo colocado.',
    'Baskıya hazır PDF veya CAD için katmanlı DXF dışa aktarın, herhangi bir görünümün fotoğrafını işleyin ya da yerleştirdiğiniz her şeyin alışveriş listesini gönderin.',
    'Exportiere ein druckfertiges PDF oder ein DXF mit Ebenen für CAD, rendere ein Foto jeder Ansicht oder verschicke eine Einkaufsliste von allem Platzierten.',
    'Esporta un PDF pronto per la stampa o un DXF a livelli per il CAD, renderizza una foto di qualsiasi vista o invia la lista della spesa di tutto ciò che hai messo.',
    'Exporte um PDF pronto para impressão ou um DXF em camadas para CAD, renderize uma foto de qualquer vista ou envie a lista de compras de tudo que você colocou.',
    'Exporteer een drukklare PDF of een DXF met lagen voor CAD, render een foto van elke weergave, of stuur een boodschappenlijst van alles wat je plaatste.',
    'Wyeksportuj PDF do druku lub warstwowy DXF do CAD, wyrenderuj zdjęcie dowolnego widoku albo wyślij listę zakupów wszystkiego, co ustawiłeś.',
    'Экспортируйте PDF для печати или послойный DXF для CAD, отрендерьте фото любого вида или отправьте список покупок всего размещённого.',
    '印刷用 PDF や CAD 用のレイヤー付き DXF を書き出し、任意の視点を写真としてレンダリングし、配置した物の買い物リストも送れます。',
    '인쇄용 PDF나 CAD용 레이어 DXF로 내보내고, 원하는 시점을 사진으로 렌더링하거나, 배치한 모든 항목의 쇼핑 목록을 보낼 수 있습니다.',
    '导出可打印的 PDF 或供 CAD 使用的分层 DXF，渲染任意视角的照片，或发送已放置物品的购物清单。',
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
print('batch14 (tour) done')
