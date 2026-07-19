# Batch 7 (v1.0.62 redesign): home-screen + editor-chrome strings.
import os
LANGS = ['fr','es','tr','de','it','pt','nl','pl','ru','ja','ko','zh']
ROOT = os.path.join(os.path.dirname(__file__), '..', 'src', 'locales')
KEYS = {
  'Welcome back': ['Bon retour','Bienvenido de nuevo','Tekrar hoş geldin','Willkommen zurück','Bentornato','Bem-vindo de volta','Welkom terug','Witaj ponownie','С возвращением','おかえりなさい','다시 오신 걸 환영해요','欢迎回来'],
  'Start a project': ['Démarrer un projet','Iniciar un proyecto','Bir proje başlat','Projekt starten','Avvia un progetto','Iniciar um projeto','Start een project','Rozpocznij projekt','Начать проект','プロジェクトを始める','프로젝트 시작','开始一个项目'],
  'Need inspiration?': ['Besoin d’inspiration ?','¿Necesitas inspiración?','İlham mı lazım?','Brauchst du Inspiration?','Cerchi ispirazione?','Precisa de inspiração?','Inspiratie nodig?','Potrzebujesz inspiracji?','Нужно вдохновение?','ヒントが必要ですか？','영감이 필요하세요?','需要灵感吗？'],
  'Explore tips to bring your dream home to life.': ['Découvrez des astuces pour donner vie à votre maison de rêve.','Explora consejos para hacer realidad la casa de tus sueños.','Hayalinizdeki evi hayata geçirmek için ipuçlarını keşfedin.','Entdecke Tipps, um dein Traumhaus zum Leben zu erwecken.','Scopri consigli per dare vita alla casa dei tuoi sogni.','Explore dicas para dar vida à casa dos seus sonhos.','Ontdek tips om je droomhuis tot leven te brengen.','Poznaj wskazówki, aby ożywić dom marzeń.','Откройте советы, чтобы воплотить дом мечты.','夢の住まいを実現するヒントを見てみましょう。','꿈꾸던 집을 완성할 팁을 살펴보세요.','探索让梦想之家成真的技巧。'],
  'Explore ideas': ['Explorer les idées','Explorar ideas','Fikirleri keşfet','Ideen entdecken','Esplora le idee','Explorar ideias','Ideeën verkennen','Odkryj pomysły','Смотреть идеи','アイデアを見る','아이디어 보기','探索创意'],
  'No projects yet — start one above.': ['Aucun projet — commencez-en un ci-dessus.','Aún no hay proyectos — empieza uno arriba.','Henüz proje yok — yukarıdan başlayın.','Noch keine Projekte — starte oben eines.','Nessun progetto — iniziane uno sopra.','Ainda sem projetos — comece um acima.','Nog geen projecten — start er hierboven een.','Brak projektów — zacznij jeden powyżej.','Проектов пока нет — начните выше.','プロジェクトはまだありません — 上から始めましょう。','아직 프로젝트가 없습니다 — 위에서 시작하세요.','还没有项目 — 从上方开始。'],
  'PDF / image / DXF': ['PDF / image / DXF','PDF / imagen / DXF','PDF / görsel / DXF','PDF / Bild / DXF','PDF / immagine / DXF','PDF / imagem / DXF','PDF / afbeelding / DXF','PDF / obraz / DXF','PDF / изображение / DXF','PDF / 画像 / DXF','PDF / 이미지 / DXF','PDF / 图片 / DXF'],
  'Home': ['Accueil','Inicio','Ana sayfa','Start','Home','Início','Home','Główna','Главная','ホーム','홈','主页'],
  'Templates': ['Modèles','Plantillas','Şablonlar','Vorlagen','Modelli','Modelos','Sjablonen','Szablony','Шаблоны','テンプレート','템플릿','模板'],
  'Measure': ['Mesurer','Medir','Ölç','Messen','Misura','Medir','Meten','Zmierz','Измерить','計測','측정','测量'],
  'Measure a wall to scale the drawing': ['Mesurez un mur pour mettre le plan à l’échelle','Mide un muro para escalar el plano','Çizimi ölçeklendirmek için bir duvar ölçün','Miss eine Wand, um den Plan zu skalieren','Misura un muro per ridimensionare il disegno','Meça uma parede para escalar o desenho','Meet een muur om de tekening te schalen','Zmierz ścianę, aby wyskalować rysunek','Измерьте стену, чтобы масштабировать чертёж','図面を拡縮するには壁を計測します','도면 축척을 위해 벽을 측정하세요','测量一面墙以缩放图纸'],
}
for i, lang in enumerate(LANGS):
    path = os.path.join(ROOT, f'{lang}.ts')
    src = open(path, encoding='utf-8').read()
    added = 0
    for key, vals in KEYS.items():
        assert len(vals) == 12, key
        qkey = key.replace("'", "\\'")
        if f"'{qkey}':" in src or f'"{key}":' in src or f'  {key}:' in src:
            continue
        qval = vals[i].replace("'", "\\'")
        idx = src.rstrip().rfind('};')
        src = src[:idx] + f"  '{qkey}': '{qval}',\n}};" + src.rstrip()[idx+2:] + '\n'
        added += 1
    open(path, 'w', encoding='utf-8').write(src)
    print(lang, added)
print('batch7 done')
