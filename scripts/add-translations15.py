# Batch 15: the body of the Tips & shortcuts panel (HelpPanel SECTIONS).
# Section headings, and every row in both its desktop and touch wording.
import os
LANGS = ['fr','es','tr','de','it','pt','nl','pl','ru','ja','ko','zh']
ROOT = os.path.join(os.path.dirname(__file__), '..', 'src', 'locales')
KEYS = {
  # ---- section headings ----
  'Drawing walls & rooms': ['Dessiner murs et pièces','Dibujar muros y habitaciones','Duvar ve oda çizme','Wände & Räume zeichnen','Disegnare muri e stanze','Desenhar paredes e cômodos','Muren en kamers tekenen','Rysowanie ścian i pomieszczeń','Черчение стен и комнат','壁と部屋を描く','벽과 방 그리기','绘制墙体与房间'],
  'Editing': ['Édition','Edición','Düzenleme','Bearbeiten','Modifica','Edição','Bewerken','Edycja','Редактирование','編集','편집','编辑'],
  'Measure & scale': ['Mesurer et mettre à l’échelle','Medir y escalar','Ölçme ve ölçek','Messen & Maßstab','Misura e scala','Medir e escalar','Meten en schalen','Pomiar i skala','Измерение и масштаб','計測と縮尺','측정 및 축척','测量与比例'],
  'Floors & 3D': ['Étages et 3D','Plantas y 3D','Katlar ve 3B','Geschosse & 3D','Piani e 3D','Pavimentos e 3D','Verdiepingen en 3D','Kondygnacje i 3D','Этажи и 3D','階と 3D','층과 3D','楼层与 3D'],

  # ---- drawing ----
  'Click to chain wall points; click a room’s first point to close it': [
    'Cliquez pour enchaîner les points de mur ; cliquez sur le premier point d’une pièce pour la fermer',
    'Haz clic para encadenar puntos de muro; haz clic en el primer punto de una habitación para cerrarla',
    'Duvar noktalarını zincirlemek için tıklayın; odayı kapatmak için ilk noktasına tıklayın',
    'Klicke, um Wandpunkte zu verketten; klicke auf den ersten Punkt eines Raums, um ihn zu schließen',
    'Clicca per concatenare i punti del muro; clicca sul primo punto di una stanza per chiuderla',
    'Clique para encadear pontos de parede; clique no primeiro ponto de um cômodo para fechá-lo',
    'Klik om muurpunten te ketenen; klik op het eerste punt van een kamer om die te sluiten',
    'Klikaj, aby łączyć punkty ścian; kliknij pierwszy punkt pomieszczenia, aby je zamknąć',
    'Щёлкайте, чтобы соединять точки стен; щёлкните первую точку комнаты, чтобы замкнуть её',
    'クリックで壁の点をつなぎます。部屋の最初の点をクリックすると閉じます',
    '클릭해 벽 점을 연결하고, 방의 첫 점을 클릭하면 닫힙니다',
    '点击可连接墙点；点击房间的第一个点即可闭合',
  ],
  'Tap to chain wall points; tap a room’s first point to close it': [
    'Touchez pour enchaîner les points de mur ; touchez le premier point d’une pièce pour la fermer',
    'Toca para encadenar puntos de muro; toca el primer punto de una habitación para cerrarla',
    'Duvar noktalarını zincirlemek için dokunun; odayı kapatmak için ilk noktasına dokunun',
    'Tippe, um Wandpunkte zu verketten; tippe auf den ersten Punkt eines Raums, um ihn zu schließen',
    'Tocca per concatenare i punti del muro; tocca il primo punto di una stanza per chiuderla',
    'Toque para encadear pontos de parede; toque no primeiro ponto de um cômodo para fechá-lo',
    'Tik om muurpunten te ketenen; tik op het eerste punt van een kamer om die te sluiten',
    'Dotykaj, aby łączyć punkty ścian; dotknij pierwszego punktu pomieszczenia, aby je zamknąć',
    'Касайтесь, чтобы соединять точки стен; коснитесь первой точки комнаты, чтобы замкнуть её',
    'タップで壁の点をつなぎます。部屋の最初の点をタップすると閉じます',
    '탭해 벽 점을 연결하고, 방의 첫 점을 탭하면 닫힙니다',
    '点按可连接墙点；点按房间的第一个点即可闭合',
  ],
  'Finish the current wall chain / room': ['Terminer la chaîne de murs / la pièce en cours','Terminar la cadena de muros / habitación actual','Geçerli duvar zincirini / odayı bitir','Aktuelle Wandkette / Raum abschließen','Termina la catena di muri / la stanza','Concluir a cadeia de paredes / o cômodo','Huidige muurketen / kamer afronden','Zakończ bieżący ciąg ścian / pomieszczenie','Завершить текущую цепочку стен / комнату','現在の壁の連なり／部屋を終了','현재 벽 연결 / 방 마치기','结束当前墙链 / 房间'],
  'Tap Finish to end the current wall chain / room': ['Touchez Terminer pour finir la chaîne de murs / la pièce','Toca Terminar para finalizar la cadena de muros / habitación','Geçerli duvar zincirini / odayı bitirmek için Bitir’e dokunun','Tippe auf Fertig, um die Wandkette / den Raum zu beenden','Tocca Fine per terminare la catena di muri / la stanza','Toque em Concluir para encerrar a cadeia de paredes / o cômodo','Tik op Klaar om de muurketen / kamer te beëindigen','Dotknij Zakończ, aby zamknąć ciąg ścian / pomieszczenie','Коснитесь «Готово», чтобы завершить цепочку стен / комнату','「完了」をタップして現在の壁／部屋を終了します','「완료」를 탭해 현재 벽 / 방을 마칩니다','点按“完成”结束当前墙链 / 房间'],
  'Cancel drawing (or clear the typed length)': ['Annuler le dessin (ou effacer la longueur saisie)','Cancelar el dibujo (o borrar la longitud escrita)','Çizimi iptal et (veya girilen uzunluğu temizle)','Zeichnen abbrechen (oder eingegebene Länge löschen)','Annulla il disegno (o cancella la lunghezza digitata)','Cancelar o desenho (ou limpar o comprimento digitado)','Tekenen annuleren (of ingevoerde lengte wissen)','Anuluj rysowanie (lub wyczyść wpisaną długość)','Отменить черчение (или очистить введённую длину)','描画をキャンセル（入力した長さもクリア）','그리기 취소 (입력한 길이도 지움)','取消绘制（或清除已输入的长度）'],
  'Tap ✕ or tap an empty area to cancel drawing': ['Touchez ✕ ou une zone vide pour annuler le dessin','Toca ✕ o un área vacía para cancelar el dibujo','Çizimi iptal etmek için ✕ veya boş bir alana dokunun','Tippe auf ✕ oder eine leere Fläche, um abzubrechen','Tocca ✕ o un’area vuota per annullare il disegno','Toque em ✕ ou numa área vazia para cancelar o desenho','Tik op ✕ of een leeg gebied om te annuleren','Dotknij ✕ lub pustego miejsca, aby anulować rysowanie','Коснитесь ✕ или пустой области, чтобы отменить','✕ か空いている場所をタップして描画をキャンセル','✕ 또는 빈 곳을 탭하면 그리기가 취소됩니다','点按 ✕ 或空白处即可取消绘制'],
  'Type a number while drawing to place the next point at that exact length (m or ft)': [
    'Tapez un nombre pendant le dessin pour placer le point suivant à cette longueur exacte (m ou ft)',
    'Escribe un número mientras dibujas para colocar el siguiente punto a esa longitud exacta (m o ft)',
    'Çizerken bir sayı yazın; sonraki nokta tam o uzunluğa yerleşir (m veya ft)',
    'Tippe beim Zeichnen eine Zahl, um den nächsten Punkt auf genau diese Länge zu setzen (m oder ft)',
    'Digita un numero mentre disegni per posizionare il punto successivo a quella lunghezza esatta (m o ft)',
    'Digite um número enquanto desenha para colocar o próximo ponto nesse comprimento exato (m ou ft)',
    'Typ een getal tijdens het tekenen om het volgende punt op precies die lengte te zetten (m of ft)',
    'Wpisz liczbę podczas rysowania, aby ustawić następny punkt na dokładnie tej długości (m lub ft)',
    'Введите число во время черчения, чтобы поставить следующую точку на точной длине (м или фт)',
    '描画中に数値を入力すると、次の点をその長さちょうどに配置します（m または ft）',
    '그리는 중 숫자를 입력하면 다음 점이 정확히 그 길이에 놓입니다 (m 또는 ft)',
    '绘制时输入数字，可将下一个点精确放置在该长度处（米或英尺）',
  ],
  'While drawing, enter a length to place the next point at that exact distance (m or ft)': [
    'Pendant le dessin, saisissez une longueur pour placer le point suivant à cette distance exacte (m ou ft)',
    'Mientras dibujas, introduce una longitud para colocar el siguiente punto a esa distancia exacta (m o ft)',
    'Çizerken bir uzunluk girin; sonraki nokta tam o mesafeye yerleşir (m veya ft)',
    'Gib beim Zeichnen eine Länge ein, um den nächsten Punkt auf genau diese Distanz zu setzen (m oder ft)',
    'Mentre disegni, inserisci una lunghezza per posizionare il punto successivo a quella distanza esatta (m o ft)',
    'Ao desenhar, informe um comprimento para colocar o próximo ponto nessa distância exata (m ou ft)',
    'Voer tijdens het tekenen een lengte in om het volgende punt op precies die afstand te zetten (m of ft)',
    'Podczas rysowania podaj długość, aby ustawić następny punkt w dokładnie tej odległości (m lub ft)',
    'Во время черчения введите длину, чтобы поставить следующую точку на точном расстоянии (м или фт)',
    '描画中に長さを入力すると、次の点をその距離ちょうどに配置します（m または ft）',
    '그리는 중 길이를 입력하면 다음 점이 정확히 그 거리에 놓입니다 (m 또는 ft)',
    '绘制时输入长度，可将下一个点精确放置在该距离处（米或英尺）',
  ],
  'Snapping is automatic: endpoints, midpoints, wall bodies, and alignment guides': [
    'L’accrochage est automatique : extrémités, milieux, corps de mur et guides d’alignement',
    'El ajuste es automático: extremos, puntos medios, cuerpos de muro y guías de alineación',
    'Yakalama otomatiktir: uç noktalar, orta noktalar, duvar gövdeleri ve hizalama kılavuzları',
    'Einrasten ist automatisch: Endpunkte, Mittelpunkte, Wandkörper und Ausrichtungslinien',
    'L’aggancio è automatico: estremità, punti medi, corpi dei muri e guide di allineamento',
    'O encaixe é automático: extremidades, pontos médios, corpos de parede e guias de alinhamento',
    'Uitlijnen gaat automatisch: eindpunten, middens, muurvlakken en hulplijnen',
    'Przyciąganie działa automatycznie: końce, środki, korpusy ścian i prowadnice',
    'Привязка автоматическая: концы, середины, тела стен и направляющие',
    'スナップは自動です（端点・中点・壁面・整列ガイド）',
    '스냅은 자동입니다: 끝점, 중간점, 벽면, 정렬 가이드',
    '自动吸附：端点、中点、墙体和对齐参考线',
  ],

  # ---- editing ----
  'Drag a wall to move it; drag an endpoint to move the whole corner': [
    'Faites glisser un mur pour le déplacer ; faites glisser une extrémité pour déplacer tout l’angle',
    'Arrastra un muro para moverlo; arrastra un extremo para mover toda la esquina',
    'Duvarı taşımak için sürükleyin; tüm köşeyi taşımak için uç noktayı sürükleyin',
    'Ziehe eine Wand, um sie zu bewegen; ziehe einen Endpunkt, um die ganze Ecke zu bewegen',
    'Trascina un muro per spostarlo; trascina un’estremità per spostare tutto l’angolo',
    'Arraste uma parede para movê-la; arraste uma extremidade para mover o canto inteiro',
    'Sleep een muur om hem te verplaatsen; sleep een eindpunt om de hele hoek te verplaatsen',
    'Przeciągnij ścianę, aby ją przesunąć; przeciągnij koniec, aby przesunąć cały narożnik',
    'Перетащите стену, чтобы сдвинуть её; перетащите конец, чтобы сдвинуть весь угол',
    '壁をドラッグして移動、端点をドラッグすると角ごと移動します',
    '벽을 드래그해 이동하고, 끝점을 드래그하면 모서리 전체가 움직입니다',
    '拖动墙体可移动；拖动端点可移动整个转角',
  ],
  'Delete selection': ['Supprimer la sélection','Eliminar la selección','Seçimi sil','Auswahl löschen','Elimina la selezione','Excluir a seleção','Selectie verwijderen','Usuń zaznaczenie','Удалить выделение','選択を削除','선택 항목 삭제','删除所选'],
  'Select an item, then tap Delete in the Edit panel': ['Sélectionnez un élément, puis touchez Supprimer dans le panneau Édition','Selecciona un elemento y toca Eliminar en el panel Edición','Bir öğe seçin, sonra Düzenle panelinde Sil’e dokunun','Wähle ein Element und tippe im Bearbeiten-Panel auf Löschen','Seleziona un elemento e tocca Elimina nel pannello Modifica','Selecione um item e toque em Excluir no painel Edição','Selecteer een item en tik op Verwijderen in het paneel Bewerken','Zaznacz element i dotknij Usuń w panelu Edycja','Выберите объект и коснитесь «Удалить» на панели редактирования','項目を選び、編集パネルの「削除」をタップします','항목을 선택한 뒤 편집 패널에서 삭제를 탭하세요','选中项目后，在“编辑”面板点按删除'],
  'Undo (add Shift to redo)': ['Annuler (ajoutez Maj pour rétablir)','Deshacer (añade Mayús para rehacer)','Geri al (yinelemek için Shift ekleyin)','Rückgängig (mit Umschalt: Wiederholen)','Annulla (aggiungi Maiusc per ripristinare)','Desfazer (com Shift para refazer)','Ongedaan maken (met Shift: opnieuw)','Cofnij (z Shift — ponów)','Отменить (с Shift — вернуть)','元に戻す（Shift でやり直し）','실행 취소 (Shift로 다시 실행)','撤销（加 Shift 为重做）'],
  'Use the undo / redo arrows in the top bar': ['Utilisez les flèches annuler / rétablir de la barre du haut','Usa las flechas deshacer / rehacer de la barra superior','Üst çubuktaki geri al / yinele oklarını kullanın','Nutze die Pfeile für Rückgängig / Wiederholen in der oberen Leiste','Usa le frecce annulla / ripristina nella barra in alto','Use as setas desfazer / refazer na barra superior','Gebruik de pijlen ongedaan maken / opnieuw in de bovenbalk','Użyj strzałek cofnij / ponów na górnym pasku','Используйте стрелки отмены / возврата на верхней панели','上部バーの元に戻す／やり直し矢印を使います','상단 바의 실행 취소 / 다시 실행 화살표를 사용하세요','使用顶部栏的撤销 / 重做箭头'],
  'Copy furniture (V pastes at the cursor, D duplicates)': ['Copier un meuble (V colle au curseur, D duplique)','Copiar mueble (V pega en el cursor, D duplica)','Mobilyayı kopyala (V imleçte yapıştırır, D çoğaltır)','Möbel kopieren (V fügt am Cursor ein, D dupliziert)','Copia il mobile (V incolla al cursore, D duplica)','Copiar móvel (V cola no cursor, D duplica)','Meubel kopiëren (V plakt bij de cursor, D dupliceert)','Kopiuj mebel (V wkleja przy kursorze, D powiela)','Копировать мебель (V вставляет у курсора, D дублирует)','家具をコピー（V でカーソル位置に貼り付け、D で複製）','가구 복사 (V는 커서 위치에 붙여넣기, D는 복제)','复制家具（V 在光标处粘贴，D 复制）'],
  'Select all furniture': ['Tout sélectionner (meubles)','Seleccionar todos los muebles','Tüm mobilyaları seç','Alle Möbel auswählen','Seleziona tutti i mobili','Selecionar todos os móveis','Alle meubels selecteren','Zaznacz wszystkie meble','Выделить всю мебель','すべての家具を選択','모든 가구 선택','选择所有家具'],
  'Nudge selected furniture 1 cm (hold Shift for 10 cm)': ['Décaler le meuble sélectionné de 1 cm (Maj pour 10 cm)','Mover el mueble seleccionado 1 cm (Mayús para 10 cm)','Seçili mobilyayı 1 cm kaydır (Shift ile 10 cm)','Ausgewähltes Möbel um 1 cm verschieben (Umschalt: 10 cm)','Sposta il mobile selezionato di 1 cm (Maiusc per 10 cm)','Mover o móvel selecionado 1 cm (Shift para 10 cm)','Geselecteerd meubel 1 cm verplaatsen (Shift voor 10 cm)','Przesuń zaznaczony mebel o 1 cm (Shift — 10 cm)','Сдвинуть выбранную мебель на 1 см (с Shift — 10 см)','選択した家具を 1 cm 移動（Shift で 10 cm）','선택한 가구를 1 cm 이동 (Shift는 10 cm)','将所选家具移动 1 厘米（按住 Shift 为 10 厘米）'],
  'Right-click (or long-press on touch) for copy / duplicate / arrange': ['Clic droit (ou appui long sur tactile) pour copier / dupliquer / organiser','Clic derecho (o pulsación larga en táctil) para copiar / duplicar / ordenar','Kopyala / çoğalt / düzenle için sağ tık (dokunmatikte uzun basın)','Rechtsklick (oder langes Tippen) für Kopieren / Duplizieren / Anordnen','Clic destro (o tocco prolungato) per copia / duplica / disponi','Clique com o botão direito (ou toque longo) para copiar / duplicar / organizar','Rechtsklik (of lang indrukken) voor kopiëren / dupliceren / schikken','Prawy przycisk (lub długie przytrzymanie) — kopiuj / powiel / rozmieść','Правый клик (или долгое нажатие) — копировать / дублировать / упорядочить','右クリック（タッチでは長押し）でコピー／複製／並べ替え','우클릭(터치에서는 길게 누르기)으로 복사 / 복제 / 정렬','右键点击（触屏长按）可复制 / 再制 / 排列'],
  'Long-press an item for copy / duplicate / arrange': ['Appui long sur un élément pour copier / dupliquer / organiser','Mantén pulsado un elemento para copiar / duplicar / ordenar','Kopyala / çoğalt / düzenle için öğeye uzun basın','Element lange antippen für Kopieren / Duplizieren / Anordnen','Tocco prolungato su un elemento per copia / duplica / disponi','Toque longo num item para copiar / duplicar / organizar','Houd een item ingedrukt voor kopiëren / dupliceren / schikken','Przytrzymaj element — kopiuj / powiel / rozmieść','Долгое нажатие на объект — копировать / дублировать / упорядочить','項目を長押ししてコピー／複製／並べ替え','항목을 길게 눌러 복사 / 복제 / 정렬','长按项目可复制 / 再制 / 排列'],
  'Pinch to zoom; drag two fingers to pan the plan': ['Pincez pour zoomer ; faites glisser deux doigts pour déplacer le plan','Pellizca para hacer zoom; arrastra con dos dedos para mover el plano','Yakınlaştırmak için sıkıştırın; planı kaydırmak için iki parmakla sürükleyin','Zum Zoomen kneifen; mit zwei Fingern den Plan verschieben','Pizzica per lo zoom; trascina con due dita per spostare la pianta','Belisque para ampliar; arraste com dois dedos para mover a planta','Knijp om te zoomen; sleep met twee vingers om de plattegrond te verschuiven','Uszczypnij, aby przybliżyć; przeciągnij dwoma palcami, aby przesunąć rzut','Сведите пальцы для масштаба; двумя пальцами перемещайте план','ピンチでズーム、2 本指のドラッグで間取りを移動','손가락을 오므려 확대하고, 두 손가락으로 끌어 평면을 이동하세요','双指捏合缩放；双指拖动可平移平面图'],

  # ---- measure ----
  'Measure tool: click two points to read a distance': ['Outil Mesure : cliquez deux points pour lire une distance','Herramienta Medir: haz clic en dos puntos para ver la distancia','Ölçüm aracı: mesafeyi görmek için iki noktaya tıklayın','Messwerkzeug: zwei Punkte anklicken, um den Abstand zu sehen','Strumento Misura: clicca due punti per leggere la distanza','Ferramenta Medir: clique em dois pontos para ver a distância','Meetgereedschap: klik twee punten om een afstand te lezen','Narzędzie Pomiar: kliknij dwa punkty, aby odczytać odległość','Инструмент «Измерение»: щёлкните две точки, чтобы узнать расстояние','計測ツール：2 点をクリックすると距離が表示されます','측정 도구: 두 점을 클릭하면 거리가 표시됩니다','测量工具：点击两点即可读取距离'],
  'Measure tool: tap two points to read a distance': ['Outil Mesure : touchez deux points pour lire une distance','Herramienta Medir: toca dos puntos para ver la distancia','Ölçüm aracı: mesafeyi görmek için iki noktaya dokunun','Messwerkzeug: zwei Punkte antippen, um den Abstand zu sehen','Strumento Misura: tocca due punti per leggere la distanza','Ferramenta Medir: toque em dois pontos para ver a distância','Meetgereedschap: tik twee punten om een afstand te lezen','Narzędzie Pomiar: dotknij dwóch punktów, aby odczytać odległość','Инструмент «Измерение»: коснитесь двух точек, чтобы узнать расстояние','計測ツール：2 点をタップすると距離が表示されます','측정 도구: 두 점을 탭하면 거리가 표시됩니다','测量工具：点按两点即可读取距离'],
  'After measuring a wall, enter its real length to rescale the whole drawing — ideal after importing a plan': [
    'Après avoir mesuré un mur, saisissez sa longueur réelle pour remettre tout le dessin à l’échelle — idéal après un import',
    'Tras medir un muro, introduce su longitud real para reescalar todo el dibujo: ideal después de importar un plano',
    'Bir duvarı ölçtükten sonra gerçek uzunluğunu girin; tüm çizim ölçeklenir — plan içe aktarımından sonra idealdir',
    'Nach dem Messen einer Wand ihre echte Länge eingeben, um die ganze Zeichnung zu skalieren — ideal nach einem Import',
    'Dopo aver misurato un muro, inserisci la sua lunghezza reale per riscalare tutto il disegno — ideale dopo un’importazione',
    'Depois de medir uma parede, informe o comprimento real para redimensionar todo o desenho — ideal após importar uma planta',
    'Voer na het meten van een muur de echte lengte in om de hele tekening te schalen — ideaal na een import',
    'Po zmierzeniu ściany podaj jej rzeczywistą długość, aby przeskalować cały rysunek — idealne po imporcie',
    'После измерения стены введите её реальную длину, чтобы масштабировать весь чертёж — удобно после импорта',
    '壁を計測したあと実際の長さを入力すると図面全体の縮尺が合います。図面の読み込み後に最適です',
    '벽을 측정한 뒤 실제 길이를 입력하면 도면 전체 축척이 맞춰집니다 — 도면을 가져온 뒤에 유용합니다',
    '测量墙体后输入其真实长度即可缩放整张图纸 — 导入图纸后尤其好用',
  ],

  # ---- floors & 3D ----
  '“+ Floor” adds a storey; click a floor name to edit it': ['« + Étage » ajoute un niveau ; cliquez sur son nom pour le modifier','«+ Planta» añade un nivel; haz clic en su nombre para editarlo','«+ Kat» bir kat ekler; adına tıklayarak düzenleyin','„+ Geschoss“ fügt eine Etage hinzu; klicke auf den Namen zum Bearbeiten','«+ Piano» aggiunge un livello; clicca sul nome per modificarlo','«+ Pavimento» adiciona um andar; clique no nome para editá-lo','„+ Verdieping” voegt een etage toe; klik op de naam om te bewerken','„+ Kondygnacja” dodaje piętro; kliknij nazwę, aby ją zmienić','«+ Этаж» добавляет уровень; щёлкните имя, чтобы изменить','「+ 階」で階を追加します。名前をクリックすると編集できます','「+ 층」으로 층을 추가하고, 층 이름을 클릭해 편집하세요','“+ 楼层”添加一层；点击楼层名称可编辑'],
  '“+ Floor” adds a storey; tap a floor name to edit it': ['« + Étage » ajoute un niveau ; touchez son nom pour le modifier','«+ Planta» añade un nivel; toca su nombre para editarlo','«+ Kat» bir kat ekler; adına dokunarak düzenleyin','„+ Geschoss“ fügt eine Etage hinzu; tippe auf den Namen zum Bearbeiten','«+ Piano» aggiunge un livello; tocca il nome per modificarlo','«+ Pavimento» adiciona um andar; toque no nome para editá-lo','„+ Verdieping” voegt een etage toe; tik op de naam om te bewerken','„+ Kondygnacja” dodaje piętro; dotknij nazwy, aby ją zmienić','«+ Этаж» добавляет уровень; коснитесь имени, чтобы изменить','「+ 階」で階を追加します。名前をタップすると編集できます','「+ 층」으로 층을 추가하고, 층 이름을 탭해 편집하세요','“+ 楼层”添加一层；点按楼层名称可编辑'],
  '3D view: Dollhouse fades walls; Walk through explores at eye level (WASD / on-screen stick)': [
    'Vue 3D : Maison de poupée estompe les murs ; Visite explore à hauteur d’œil (WASD / joystick à l’écran)',
    'Vista 3D: Casa de muñecas atenúa los muros; Recorrido explora a la altura de los ojos (WASD / joystick en pantalla)',
    '3B görünüm: Oyuncak ev duvarları soluklaştırır; Gezinti göz hizasında dolaştırır (WASD / ekran çubuğu)',
    '3D-Ansicht: Puppenhaus blendet Wände aus; Rundgang erkundet auf Augenhöhe (WASD / Bildschirm-Stick)',
    'Vista 3D: Casa delle bambole sfuma i muri; Percorso esplora ad altezza occhi (WASD / stick a schermo)',
    'Vista 3D: Casa de bonecas esmaece paredes; Percorrer explora à altura dos olhos (WASD / manche na tela)',
    '3D-weergave: Poppenhuis vervaagt muren; Rondlopen verkent op ooghoogte (WASD / stick op het scherm)',
    'Widok 3D: Domek dla lalek wygasza ściany; Spacer zwiedza na wysokości oczu (WASD / gałka na ekranie)',
    'Вид 3D: «Кукольный дом» приглушает стены; «Прогулка» — обзор на уровне глаз (WASD / экранный джойстик)',
    '3D ビュー：ドールハウスは壁を薄くし、ウォークスルーは目線の高さで歩けます（WASD／画面スティック）',
    '3D 보기: 돌하우스는 벽을 흐리게 하고, 워크스루는 눈높이에서 둘러봅니다 (WASD / 화면 스틱)',
    '3D 视图：娃娃屋模式淡化墙体；漫游以视平线探索（WASD / 屏幕摇杆）',
  ],
  '3D view: Dollhouse fades walls; Walk through explores at eye level with the on-screen stick': [
    'Vue 3D : Maison de poupée estompe les murs ; Visite explore à hauteur d’œil avec le joystick à l’écran',
    'Vista 3D: Casa de muñecas atenúa los muros; Recorrido explora a la altura de los ojos con el joystick en pantalla',
    '3B görünüm: Oyuncak ev duvarları soluklaştırır; Gezinti ekran çubuğuyla göz hizasında dolaştırır',
    '3D-Ansicht: Puppenhaus blendet Wände aus; Rundgang erkundet auf Augenhöhe mit dem Bildschirm-Stick',
    'Vista 3D: Casa delle bambole sfuma i muri; Percorso esplora ad altezza occhi con lo stick a schermo',
    'Vista 3D: Casa de bonecas esmaece paredes; Percorrer explora à altura dos olhos com o manche na tela',
    '3D-weergave: Poppenhuis vervaagt muren; Rondlopen verkent op ooghoogte met de stick op het scherm',
    'Widok 3D: Domek dla lalek wygasza ściany; Spacer zwiedza na wysokości oczu gałką na ekranie',
    'Вид 3D: «Кукольный дом» приглушает стены; «Прогулка» — обзор на уровне глаз экранным джойстиком',
    '3D ビュー：ドールハウスは壁を薄くし、ウォークスルーは画面スティックで目線の高さを歩けます',
    '3D 보기: 돌하우스는 벽을 흐리게 하고, 워크스루는 화면 스틱으로 눈높이에서 둘러봅니다',
    '3D 视图：娃娃屋模式淡化墙体；漫游用屏幕摇杆以视平线探索',
  ],
  'Render image saves a snapshot; Photo mode ray-traces a realistic still': [
    '« Rendu » enregistre une capture ; le mode Photo calcule une image réaliste en lancer de rayons',
    '«Renderizar» guarda una captura; el modo Foto traza rayos para una imagen realista',
    '«Görüntü işle» anlık görüntü kaydeder; Fotoğraf modu ışın izleyerek gerçekçi bir kare üretir',
    '„Bild rendern“ speichert eine Aufnahme; der Fotomodus berechnet ein realistisches Bild per Raytracing',
    '«Renderizza» salva un’istantanea; la modalità Foto calcola un’immagine realistica in ray tracing',
    '«Renderizar» salva um instantâneo; o modo Foto faz ray tracing de uma imagem realista',
    '„Afbeelding renderen” slaat een opname op; Fotomodus raytracet een realistisch beeld',
    '„Renderuj obraz” zapisuje zrzut; tryb Foto śledzi promienie dla realistycznego ujęcia',
    '«Рендер» сохраняет снимок; режим «Фото» строит реалистичный кадр трассировкой лучей',
    '「画像を書き出し」はスナップショットを保存し、フォトモードはレイトレーシングで写実的な静止画を作ります',
    '「이미지 렌더」는 스냅숏을 저장하고, 사진 모드는 레이트레이싱으로 사실적인 정지 이미지를 만듭니다',
    '“渲染图像”保存快照；照片模式用光线追踪生成写实静帧',
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
print('batch15 (tips panel) done')
