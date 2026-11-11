import os
LANGS = ['fr','es','tr','de','it','pt','nl','pl','ru','ja','ko','zh']
ROOT = os.path.join(os.path.dirname(__file__), '..', 'src', 'locales')
# AI plan: the questionnaire, preview and revise screen, and its entry points.
# Values use the typographic apostrophe (’) only: the writer below does not
# escape ASCII quotes.
KEYS = {
    'AI plan': [
        'Plan IA', 'Plano con IA', 'Yapay zekâ planı', 'KI-Plan', 'Progetto IA', 'Planta com IA',
        'AI-ontwerp', 'Plan AI', 'ИИ-план', 'AIプラン', 'AI 도면', 'AI 平面图',
    ],
    'Create a plan with AI': [
        'Créer un plan avec l’IA', 'Crear un plano con IA', 'Yapay zekâ ile plan oluştur', 'Plan mit KI erstellen',
        'Crea un progetto con l’IA', 'Criar uma planta com IA', 'Ontwerp maken met AI', 'Utwórz plan z AI',
        'Создать план с ИИ', 'AIでプランを作成', 'AI로 도면 만들기', '用 AI 生成平面图',
    ],
    'Describe your home in your own words': [
        'Décrivez votre maison avec vos mots', 'Describe tu casa con tus palabras',
        'Evinizi kendi cümlelerinizle anlatın', 'Beschreibe dein Zuhause in eigenen Worten',
        'Descrivi la tua casa a parole tue', 'Descreva a sua casa por palavras suas',
        'Beschrijf je huis in je eigen woorden', 'Opisz swój dom własnymi słowami', 'Опишите дом своими словами',
        '自分の言葉で家を説明', '원하는 집을 자유롭게 설명', '用您自己的话描述住宅',
    ],
    'Answer a few questions, describe your home, and get a floor plan you can edit.': [
        'Répondez à quelques questions, décrivez votre maison et obtenez un plan modifiable.',
        'Responde unas preguntas, describe tu casa y recibe un plano que puedes editar.',
        'Birkaç soruyu yanıtlayın, evinizi anlatın ve düzenleyebileceğiniz bir kat planı alın.',
        'Beantworte ein paar Fragen, beschreibe dein Zuhause und erhalte einen Grundriss, den du bearbeiten kannst.',
        'Rispondi a qualche domanda, descrivi la tua casa e ottieni un progetto modificabile.',
        'Responda a algumas perguntas, descreva a sua casa e receba uma planta que pode editar.',
        'Beantwoord een paar vragen, beschrijf je huis en krijg een plattegrond die je kunt bewerken.',
        'Odpowiedz na kilka pytań, opisz swój dom i otrzymaj plan, który możesz edytować.',
        'Ответьте на несколько вопросов, опишите дом и получите план, который можно редактировать.',
        'いくつかの質問に答えて家を説明すると、編集できる間取りプランが作成されます。',
        '몇 가지 질문에 답하고 집을 설명하면 편집할 수 있는 도면을 만들어 드립니다.',
        '回答几个问题并描述您的住宅，即可获得可编辑的平面图。',
    ],
    'Start': [
        'Commencer', 'Empezar', 'Başla', 'Starten', 'Inizia', 'Começar', 'Starten', 'Rozpocznij', 'Начать',
        '開始', '시작', '开始',
    ],
    'Describe the home you want and get a floor plan you can edit. Sign in to start; new accounts get free AI points to try it.': [
        'Décrivez la maison que vous voulez et obtenez un plan modifiable. Connectez-vous pour commencer ; les nouveaux comptes reçoivent des points IA gratuits pour essayer.',
        'Describe la casa que quieres y recibe un plano que puedes editar. Inicia sesión para empezar; las cuentas nuevas reciben puntos de IA gratis para probarlo.',
        'İstediğiniz evi anlatın, düzenleyebileceğiniz bir kat planı alın. Başlamak için giriş yapın; yeni hesaplar denemek için ücretsiz yapay zekâ puanı alır.',
        'Beschreibe dein Wunschhaus und erhalte einen Grundriss, den du bearbeiten kannst. Melde dich an, um zu starten; neue Konten erhalten kostenlose KI-Punkte zum Ausprobieren.',
        'Descrivi la casa che vuoi e ottieni un progetto modificabile. Accedi per iniziare: i nuovi account ricevono punti IA gratuiti per provarlo.',
        'Descreva a casa que quer e receba uma planta que pode editar. Inicie sessão para começar; as contas novas recebem pontos de IA grátis para experimentar.',
        'Beschrijf het huis dat je wilt en krijg een plattegrond die je kunt bewerken. Log in om te beginnen; nieuwe accounts krijgen gratis AI-punten om het te proberen.',
        'Opisz dom, jaki chcesz, i otrzymaj plan, który możesz edytować. Zaloguj się, aby zacząć; nowe konta dostają darmowe punkty AI na próbę.',
        'Опишите дом, который хотите, и получите план, который можно редактировать. Войдите, чтобы начать: новые аккаунты получают бесплатные ИИ-баллы на пробу.',
        '希望の家を説明すると、編集できる間取りプランが作成されます。開始するにはログインしてください。新規アカウントにはお試し用の無料AIポイントが付与されます。',
        '원하는 집을 설명하면 편집할 수 있는 도면을 만들어 드립니다. 시작하려면 로그인하세요. 새 계정에는 체험용 무료 AI 포인트가 제공됩니다.',
        '描述您想要的住宅，即可获得可编辑的平面图。登录后即可开始；新账户可获得免费 AI积分用于试用。',
    ],
    'The AI planner is not available yet. Please check back soon.': [
        'Le planificateur IA n’est pas encore disponible. Revenez bientôt.',
        'El planificador con IA aún no está disponible. Vuelve pronto.',
        'Yapay zekâ planlayıcı henüz kullanılamıyor. Lütfen yakında tekrar bakın.',
        'Der KI-Planer ist noch nicht verfügbar. Schau bald wieder vorbei.',
        'Il pianificatore IA non è ancora disponibile. Riprova presto.',
        'O planeador com IA ainda não está disponível. Volte em breve.',
        'De AI-planner is nog niet beschikbaar. Kom binnenkort terug.',
        'Planer AI nie jest jeszcze dostępny. Zajrzyj wkrótce.',
        'ИИ-планировщик пока недоступен. Загляните позже.',
        'AIプランナーはまだご利用いただけません。しばらくしてからもう一度お試しください。',
        'AI 플래너는 아직 사용할 수 없습니다. 잠시 후 다시 확인해 주세요.',
        'AI 规划功能暂未开放，请稍后再来。',
    ],
    # --- the questions ---
    'Describe the home you want': [
        'Décrivez la maison que vous voulez', 'Describe la casa que quieres', 'İstediğiniz evi anlatın',
        'Beschreibe dein Wunschhaus', 'Descrivi la casa che vuoi', 'Descreva a casa que quer',
        'Beschrijf het huis dat je wilt', 'Opisz dom, jaki chcesz', 'Опишите дом, который хотите',
        '希望の家を説明してください', '원하는 집을 설명해 주세요', '描述您想要的住宅',
    ],
    'For example: a bright family home with an open kitchen and a quiet office': [
        'Par exemple : une maison familiale lumineuse avec cuisine ouverte et bureau au calme',
        'Por ejemplo: una casa familiar luminosa con cocina abierta y un despacho tranquilo',
        'Örneğin: açık mutfaklı, sessiz bir çalışma odası olan aydınlık bir aile evi',
        'Zum Beispiel: ein helles Familienhaus mit offener Küche und ruhigem Arbeitszimmer',
        'Ad esempio: una casa familiare luminosa con cucina a vista e uno studio tranquillo',
        'Por exemplo: uma casa de família luminosa com cozinha aberta e um escritório sossegado',
        'Bijvoorbeeld: een licht gezinshuis met open keuken en een rustige werkkamer',
        'Na przykład: jasny dom rodzinny z otwartą kuchnią i cichym gabinetem',
        'Например: светлый семейный дом с открытой кухней и тихим кабинетом',
        '例：オープンキッチンと静かな書斎のある明るいファミリー向けの家',
        '예: 오픈 주방과 조용한 서재가 있는 밝은 가족용 주택',
        '例如：明亮的家庭住宅，带开放式厨房和安静的书房',
    ],
    'Bedrooms': [
        'Chambres', 'Dormitorios', 'Yatak odaları', 'Schlafzimmer', 'Camere da letto', 'Quartos', 'Slaapkamers',
        'Sypialnie', 'Спальни', '寝室', '침실', '卧室',
    ],
    'Bathrooms': [
        'Salles de bain', 'Baños', 'Banyolar', 'Badezimmer', 'Bagni', 'Casas de banho', 'Badkamers', 'Łazienki',
        'Ванные', 'バスルーム', '욕실', '浴室',
    ],
    'Total size': [
        'Surface totale', 'Superficie total', 'Toplam alan', 'Gesamtfläche', 'Superficie totale', 'Área total',
        'Totale oppervlakte', 'Powierzchnia całkowita', 'Общая площадь', '延床面積', '전체 면적', '总面积',
    ],
    'Furnished': [
        'Meublé', 'Amueblado', 'Mobilyalı', 'Möbliert', 'Arredato', 'Com mobília', 'Gemeubileerd', 'Umeblowany',
        'С мебелью', '家具付き', '가구 포함', '带家具',
    ],
    'Garage': [
        'Garage', 'Garaje', 'Garaj', 'Garage', 'Garage', 'Garagem', 'Garage', 'Garaż', 'Гараж', 'ガレージ', '차고',
        '车库',
    ],
    'less': [
        'moins', 'menos', 'azalt', 'weniger', 'meno', 'menos', 'minder', 'mniej', 'меньше', '減らす', '줄이기', '减少',
    ],
    'more': [
        'plus', 'más', 'artır', 'mehr', 'più', 'mais', 'meer', 'więcej', 'больше', '増やす', '늘리기', '增加',
    ],
    'These rooms need more space. Choose at least:': [
        'Ces pièces demandent plus de place. Choisissez au moins :',
        'Estas habitaciones necesitan más espacio. Elige al menos:',
        'Bu odalar için daha fazla alan gerekiyor. En az şunu seçin:',
        'Diese Räume brauchen mehr Platz. Wähle mindestens:',
        'Queste stanze richiedono più spazio. Scegli almeno:',
        'Estas divisões precisam de mais espaço. Escolha pelo menos:',
        'Deze kamers hebben meer ruimte nodig. Kies minimaal:',
        'Te pomieszczenia potrzebują więcej miejsca. Wybierz co najmniej:',
        'Этим комнатам нужно больше места. Выберите не менее:',
        'これらの部屋にはもっと広さが必要です。最低でも次の面積を選んでください：',
        '이 방들에는 더 넓은 공간이 필요합니다. 최소 다음 면적을 선택하세요:',
        '这些房间需要更大的面积。请至少选择：',
    ],
    'Create plan': [
        'Créer le plan', 'Crear plano', 'Plan oluştur', 'Plan erstellen', 'Crea progetto', 'Criar planta',
        'Ontwerp maken', 'Utwórz plan', 'Создать план', 'プランを作成', '도면 만들기', '生成平面图',
    ],
    'Drawing your plan…': [
        'Création de votre plan…', 'Dibujando tu plano…', 'Planınız çiziliyor…', 'Dein Plan wird gezeichnet…',
        'Sto disegnando il tuo progetto…', 'A desenhar a sua planta…', 'Je ontwerp wordt getekend…',
        'Rysuję twój plan…', 'Рисуем ваш план…', 'プランを作成中…', '도면을 그리는 중…', '正在绘制您的平面图…',
    ],
    'Your answers and description are sent to our AI provider to draw the plan. It can take up to a minute.': [
        'Vos réponses et votre description sont envoyées à notre fournisseur d’IA pour dessiner le plan. Cela peut prendre jusqu’à une minute.',
        'Tus respuestas y tu descripción se envían a nuestro proveedor de IA para dibujar el plano. Puede tardar hasta un minuto.',
        'Yanıtlarınız ve açıklamanız, planın çizilmesi için yapay zekâ sağlayıcımıza gönderilir. Bir dakika kadar sürebilir.',
        'Deine Antworten und deine Beschreibung werden an unseren KI-Anbieter gesendet, um den Plan zu zeichnen. Das kann bis zu einer Minute dauern.',
        'Le tue risposte e la descrizione vengono inviate al nostro fornitore di IA per disegnare il progetto. Può richiedere fino a un minuto.',
        'As suas respostas e a descrição são enviadas ao nosso fornecedor de IA para desenhar a planta. Pode demorar até um minuto.',
        'Je antwoorden en beschrijving worden naar onze AI-provider gestuurd om het ontwerp te tekenen. Dit kan tot een minuut duren.',
        'Twoje odpowiedzi i opis są wysyłane do naszego dostawcy AI, aby narysować plan. Może to potrwać do minuty.',
        'Ваши ответы и описание отправляются нашему ИИ-провайдеру для создания плана. Это может занять до минуты.',
        'プラン作成のため、回答と説明がAIプロバイダーに送信されます。最大1分ほどかかる場合があります。',
        '도면 작성을 위해 답변과 설명이 AI 제공업체로 전송됩니다. 최대 1분 정도 걸릴 수 있습니다.',
        '您的回答和描述将发送给我们的 AI 服务商以绘制平面图，最多可能需要一分钟。',
    ],
    'The plan could not be read. Please try again.': [
        'Le plan n’a pas pu être lu. Veuillez réessayer.', 'No se pudo leer el plano. Inténtalo de nuevo.',
        'Plan okunamadı. Lütfen tekrar deneyin.', 'Der Plan konnte nicht gelesen werden. Bitte versuche es erneut.',
        'Impossibile leggere il progetto. Riprova.', 'Não foi possível ler a planta. Tente novamente.',
        'Het ontwerp kon niet worden gelezen. Probeer het opnieuw.', 'Nie udało się odczytać planu. Spróbuj ponownie.',
        'Не удалось прочитать план. Повторите попытку.', 'プランを読み込めませんでした。もう一度お試しください。',
        '도면을 읽을 수 없습니다. 다시 시도해 주세요.', '无法读取平面图，请重试。',
    ],
    # --- the result ---
    'Use this plan': [
        'Utiliser ce plan', 'Usar este plano', 'Bu planı kullan', 'Diesen Plan verwenden', 'Usa questo progetto',
        'Usar esta planta', 'Dit ontwerp gebruiken', 'Użyj tego planu', 'Использовать этот план', 'このプランを使う',
        '이 도면 사용', '使用此平面图',
    ],
    'Want something different? Say what to change.': [
        'Envie d’autre chose ? Dites ce qu’il faut changer.', '¿Quieres algo distinto? Di qué cambiar.',
        'Farklı bir şey mi istiyorsunuz? Neyin değişeceğini yazın.', 'Lieber etwas anderes? Sag, was sich ändern soll.',
        'Vuoi qualcosa di diverso? Scrivi cosa cambiare.', 'Quer algo diferente? Diga o que mudar.',
        'Liever iets anders? Zeg wat er moet veranderen.', 'Chcesz czegoś innego? Napisz, co zmienić.',
        'Хотите иначе? Напишите, что изменить.', '別の案がよいですか？変更したい点を入力してください。',
        '다르게 하고 싶으신가요? 바꿀 점을 적어 주세요.', '想要不同的方案？请说明要修改的地方。',
    ],
    'For example: make the kitchen bigger and add a home office': [
        'Par exemple : agrandir la cuisine et ajouter un bureau', 'Por ejemplo: agranda la cocina y añade un despacho',
        'Örneğin: mutfağı büyüt ve bir çalışma odası ekle',
        'Zum Beispiel: Küche vergrößern und ein Arbeitszimmer hinzufügen',
        'Ad esempio: ingrandisci la cucina e aggiungi uno studio',
        'Por exemplo: aumentar a cozinha e acrescentar um escritório',
        'Bijvoorbeeld: maak de keuken groter en voeg een werkkamer toe', 'Na przykład: powiększ kuchnię i dodaj gabinet',
        'Например: увеличить кухню и добавить кабинет', '例：キッチンを広くして書斎を追加', '예: 주방을 넓히고 서재 추가',
        '例如：把厨房扩大，并增加一间书房',
    ],
    'Update plan': [
        'Mettre à jour le plan', 'Actualizar plano', 'Planı güncelle', 'Plan aktualisieren', 'Aggiorna progetto',
        'Atualizar planta', 'Ontwerp bijwerken', 'Zaktualizuj plan', 'Обновить план', 'プランを更新', '도면 업데이트',
        '更新平面图',
    ],
    'Start over': [
        'Recommencer', 'Empezar de nuevo', 'Baştan başla', 'Neu beginnen', 'Ricomincia', 'Recomeçar',
        'Opnieuw beginnen', 'Zacznij od nowa', 'Начать заново', '最初からやり直す', '처음부터 다시', '重新开始',
    ],
    'Replace the current design?': [
        'Remplacer le plan actuel ?', '¿Reemplazar el diseño actual?', 'Mevcut tasarım değiştirilsin mi?',
        'Aktuellen Entwurf ersetzen?', 'Sostituire il progetto attuale?', 'Substituir o projeto atual?',
        'Huidig ontwerp vervangen?', 'Zastąpić bieżący projekt?', 'Заменить текущий проект?',
        '現在のデザインを置き換えますか？', '현재 디자인을 교체할까요?', '要替换当前设计吗？',
    ],
    'The AI plan will replace the plan you have now. With Pro it opens as a new project and you keep both.': [
        'Le plan IA remplacera votre plan actuel. Avec Pro, il s’ouvre comme un nouveau projet et vous gardez les deux.',
        'El plano con IA sustituirá al que tienes ahora. Con Pro se abre como un proyecto nuevo y conservas ambos.',
        'Yapay zekâ planı şu anki planınızın yerini alacak. Pro ile yeni bir proje olarak açılır ve ikisi de sizde kalır.',
        'Der KI-Plan ersetzt deinen aktuellen Plan. Mit Pro öffnet er sich als neues Projekt und du behältst beide.',
        'Il progetto IA sostituirà quello attuale. Con Pro si apre come nuovo progetto e li conservi entrambi.',
        'A planta com IA vai substituir a que tem agora. Com o Pro, abre como um novo projeto e fica com as duas.',
        'Het AI-ontwerp vervangt je huidige ontwerp. Met Pro opent het als nieuw project en houd je beide.',
        'Plan AI zastąpi twój obecny plan. Z Pro otworzy się jako nowy projekt i zachowasz oba.',
        'ИИ-план заменит ваш текущий план. С Pro он откроется как новый проект, и у вас останутся оба.',
        'AIプランが現在のプランに置き換わります。Proなら新しいプロジェクトとして開かれ、両方を残せます。',
        'AI 도면이 현재 도면을 대체합니다. Pro에서는 새 프로젝트로 열려 둘 다 보관할 수 있습니다.',
        'AI 平面图将替换您当前的平面图。使用 Pro 时，它会作为新项目打开，两者都可保留。',
    ],
    'Your plan is ready to edit': [
        'Votre plan est prêt à être modifié', 'Tu plano está listo para editar', 'Planınız düzenlemeye hazır',
        'Dein Plan ist bereit zum Bearbeiten', 'Il tuo progetto è pronto da modificare',
        'A sua planta está pronta para editar', 'Je ontwerp is klaar om te bewerken', 'Twój plan jest gotowy do edycji',
        'Ваш план готов к редактированию', 'プランを編集できます', '도면을 편집할 수 있습니다', '平面图已可编辑',
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
