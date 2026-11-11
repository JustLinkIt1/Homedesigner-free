import os
LANGS = ['fr','es','tr','de','it','pt','nl','pl','ru','ja','ko','zh']
ROOT = os.path.join(os.path.dirname(__file__), '..', 'src', 'locales')
# Values use the typographic apostrophe (’) only: the writer below does not
# escape ASCII quotes.
KEYS = {
    # --- Designer review (AI assistant) ---
    'Designer review': [
        'Avis de designer', 'Revisión de diseño', 'Tasarımcı değerlendirmesi', 'Designer-Bewertung',
        'Parere del designer', 'Avaliação de designer', 'Designerbeoordeling', 'Ocena projektanta',
        'Оценка дизайнера', 'デザイナーレビュー', '디자이너 리뷰', '设计师点评',
    ],
    'An AI interior designer scores your plan and lists the changes that would help most.': [
        'Un designer d’intérieur IA note votre plan et liste les changements les plus utiles.',
        'Un diseñador de interiores con IA puntúa tu plano y enumera los cambios que más ayudarían.',
        'Yapay zekâ iç mimar planınızı puanlar ve en çok fayda sağlayacak değişiklikleri sıralar.',
        'Ein KI-Innenarchitekt bewertet deinen Plan und nennt die Änderungen, die am meisten bringen.',
        'Un interior designer IA valuta il tuo progetto ed elenca le modifiche più utili.',
        'Um designer de interiores com IA avalia a sua planta e lista as mudanças que mais ajudariam.',
        'Een AI-interieurontwerper beoordeelt je ontwerp en noemt de aanpassingen die het meest opleveren.',
        'Projektant wnętrz AI ocenia twój plan i wymienia zmiany, które dadzą najwięcej.',
        'ИИ-дизайнер интерьеров оценит ваш план и перечислит самые полезные изменения.',
        'AIインテリアデザイナーがプランを採点し、効果の大きい改善点を挙げます。',
        'AI 인테리어 디자이너가 도면을 평가하고 가장 도움이 될 변경 사항을 알려 드립니다.',
        'AI 室内设计师为您的平面图打分，并列出最有帮助的修改。',
    ],
    'Optional: what matters most to you?': [
        'Facultatif : qu’est-ce qui compte le plus ?',
        'Opcional: ¿qué es lo más importante?',
        'İsteğe bağlı: sizin için en önemlisi ne?',
        'Optional: Was ist dir am wichtigsten?',
        'Facoltativo: cosa conta di più?',
        'Opcional: o que mais importa?',
        'Optioneel: wat is het belangrijkst?',
        'Opcjonalnie: co jest najważniejsze?',
        'Необязательно: что для вас важнее всего?',
        '任意：重視したいことは？',
        '선택 사항: 가장 중요한 점은?',
        '可选：您最看重什么？',
    ],
    'Include a picture of the plan for better advice': [
        'Joindre une image du plan pour de meilleurs conseils',
        'Incluir una imagen del plano para obtener mejores consejos',
        'Daha iyi öneriler için planın görselini ekle',
        'Bild des Plans mitsenden für bessere Tipps',
        'Includi un’immagine del progetto per consigli migliori',
        'Incluir uma imagem da planta para conselhos melhores',
        'Afbeelding van het ontwerp meesturen voor beter advies',
        'Dołącz obraz planu, aby uzyskać lepsze porady',
        'Приложить изображение плана для более точных советов',
        'より的確なアドバイスのためにプランの画像を含める',
        '더 나은 조언을 위해 도면 이미지 포함',
        '附上平面图图片以获得更好的建议',
    ],
    'Your room list and the picture are sent to our AI provider to write the review.': [
        'La liste de vos pièces et l’image sont envoyées à notre fournisseur d’IA pour rédiger l’avis.',
        'La lista de habitaciones y la imagen se envían a nuestro proveedor de IA para redactar la revisión.',
        'Oda listeniz ve görsel, değerlendirmenin yazılması için yapay zekâ sağlayıcımıza gönderilir.',
        'Deine Raumliste und das Bild werden an unseren KI-Anbieter gesendet, um die Bewertung zu erstellen.',
        'L’elenco delle stanze e l’immagine vengono inviati al nostro fornitore di IA per scrivere il parere.',
        'A lista de divisões e a imagem são enviadas ao nosso fornecedor de IA para escrever a avaliação.',
        'Je kamerlijst en de afbeelding worden naar onze AI-provider gestuurd om de beoordeling te schrijven.',
        'Lista pomieszczeń i obraz są wysyłane do naszego dostawcy AI, aby przygotować ocenę.',
        'Список комнат и изображение отправляются нашему ИИ-провайдеру для подготовки оценки.',
        'レビュー作成のため、部屋のリストと画像がAIプロバイダーに送信されます。',
        '리뷰 작성을 위해 방 목록과 이미지가 AI 제공업체로 전송됩니다.',
        '房间列表和图片将发送给我们的 AI 服务商以撰写点评。',
    ],
    'This review was written for an earlier version of the plan.': [
        'Cet avis a été rédigé pour une version antérieure du plan.',
        'Esta revisión se escribió para una versión anterior del plano.',
        'Bu değerlendirme planın önceki bir sürümü için yazıldı.',
        'Diese Bewertung wurde für eine frühere Version des Plans erstellt.',
        'Questo parere è stato scritto per una versione precedente del progetto.',
        'Esta avaliação foi escrita para uma versão anterior da planta.',
        'Deze beoordeling is geschreven voor een eerdere versie van het ontwerp.',
        'Ta ocena dotyczy wcześniejszej wersji planu.',
        'Эта оценка написана для более ранней версии плана.',
        'このレビューは以前のプランに対するものです。',
        '이 리뷰는 이전 버전의 도면을 기준으로 작성되었습니다.',
        '此点评针对的是平面图的早期版本。',
    ],
    'Score': [
        'Note', 'Puntuación', 'Puan', 'Bewertung', 'Punteggio', 'Nota', 'Score', 'Ocena', 'Оценка',
        'スコア', '점수', '评分',
    ],
    'High impact': [
        'Fort impact', 'Alto impacto', 'Yüksek etki', 'Große Wirkung', 'Alto impatto', 'Alto impacto',
        'Grote impact', 'Duży wpływ', 'Сильный эффект', '効果大', '효과 큼', '效果显著',
    ],
    'Medium impact': [
        'Impact moyen', 'Impacto medio', 'Orta etki', 'Mittlere Wirkung', 'Medio impatto', 'Impacto médio',
        'Gemiddelde impact', 'Średni wpływ', 'Средний эффект', '効果中', '효과 보통', '效果中等',
    ],
    'Low impact': [
        'Faible impact', 'Bajo impacto', 'Düşük etki', 'Kleine Wirkung', 'Basso impatto', 'Baixo impacto',
        'Kleine impact', 'Mały wpływ', 'Небольшой эффект', '効果小', '효과 작음', '效果较小',
    ],
    'Review my plan': [
        'Évaluer mon plan', 'Revisar mi plano', 'Planımı değerlendir', 'Meinen Plan bewerten',
        'Valuta il mio progetto', 'Avaliar a minha planta', 'Mijn ontwerp beoordelen', 'Oceń mój plan',
        'Оценить мой план', 'プランをレビュー', '내 도면 리뷰', '点评我的平面图',
    ],
    'Copy review': [
        'Copier l’avis', 'Copiar revisión', 'Değerlendirmeyi kopyala', 'Bewertung kopieren', 'Copia parere',
        'Copiar avaliação', 'Beoordeling kopiëren', 'Kopiuj ocenę', 'Скопировать оценку', 'レビューをコピー',
        '리뷰 복사', '复制点评',
    ],
    'Review copied': [
        'Avis copié', 'Revisión copiada', 'Değerlendirme kopyalandı', 'Bewertung kopiert', 'Parere copiato',
        'Avaliação copiada', 'Beoordeling gekopieerd', 'Skopiowano ocenę', 'Оценка скопирована',
        'レビューをコピーしました', '리뷰가 복사되었습니다', '点评已复制',
    ],
    # --- Voice tour (AI assistant, Pro) ---
    'Voice tour': [
        'Visite audio', 'Recorrido por voz', 'Sesli tur', 'Audio-Tour', 'Tour vocale', 'Tour por voz',
        'Audiotour', 'Wycieczka głosowa', 'Голосовой тур', '音声ツアー', '음성 투어', '语音导览',
    ],
    'A narrated audio walk-through of your home, ready to play or share.': [
        'Une visite audio commentée de votre maison, prête à écouter ou à partager.',
        'Un recorrido narrado por tu casa, listo para escuchar o compartir.',
        'Evinizin sesli anlatımlı turu; dinlemeye veya paylaşmaya hazır.',
        'Ein gesprochener Rundgang durch dein Zuhause, zum Anhören oder Teilen.',
        'Un tour audio narrato della tua casa, pronto da ascoltare o condividere.',
        'Um tour narrado pela sua casa, pronto para ouvir ou partilhar.',
        'Een ingesproken rondleiding door je huis, klaar om af te spelen of te delen.',
        'Narracyjna wycieczka audio po twoim domu, gotowa do odsłuchania lub udostępnienia.',
        'Озвученная аудиоэкскурсия по вашему дому: слушайте или делитесь.',
        'ナレーション付きの音声でご自宅を案内。再生も共有もできます。',
        '내레이션이 담긴 우리 집 음성 투어. 바로 듣거나 공유할 수 있습니다.',
        '带解说的住宅语音导览，可直接播放或分享。',
    ],
    'Create voice tour': [
        'Créer la visite audio', 'Crear recorrido por voz', 'Sesli tur oluştur', 'Audio-Tour erstellen',
        'Crea tour vocale', 'Criar tour por voz', 'Audiotour maken', 'Utwórz wycieczkę głosową',
        'Создать голосовой тур', '音声ツアーを作成', '음성 투어 만들기', '生成语音导览',
    ],
    'Voice tour ready': [
        'Visite audio prête', 'Recorrido por voz listo', 'Sesli tur hazır', 'Audio-Tour fertig',
        'Tour vocale pronto', 'Tour por voz pronto', 'Audiotour klaar', 'Wycieczka głosowa gotowa',
        'Голосовой тур готов', '音声ツアーの準備ができました', '음성 투어가 준비되었습니다', '语音导览已生成',
    ],
    'Save audio': [
        'Enregistrer l’audio', 'Guardar audio', 'Sesi kaydet', 'Audio speichern', 'Salva audio',
        'Guardar áudio', 'Audio opslaan', 'Zapisz audio', 'Сохранить аудио', '音声を保存', '오디오 저장',
        '保存音频',
    ],
    'Save the recording to keep it. It is not stored after you close the app.': [
        'Enregistrez l’audio pour le conserver. Il n’est pas gardé après la fermeture de l’application.',
        'Guarda la grabación para conservarla. No se almacena al cerrar la app.',
        'Saklamak için kaydı kaydedin. Uygulamayı kapattıktan sonra saklanmaz.',
        'Speichere die Aufnahme, um sie zu behalten. Nach dem Schließen der App ist sie weg.',
        'Salva la registrazione per conservarla. Non viene mantenuta dopo la chiusura dell’app.',
        'Guarde a gravação para a manter. Não fica armazenada depois de fechar a app.',
        'Sla de opname op om hem te bewaren. Na het sluiten van de app is hij weg.',
        'Zapisz nagranie, aby je zachować. Po zamknięciu aplikacji nie jest przechowywane.',
        'Сохраните запись, чтобы не потерять её. После закрытия приложения она не хранится.',
        '残しておくには録音を保存してください。アプリを閉じると保持されません。',
        '보관하려면 녹음을 저장하세요. 앱을 닫으면 유지되지 않습니다.',
        '请保存录音以便保留。关闭应用后不会保存。',
    ],
    'The recording could not be played. Please try again.': [
        'L’enregistrement n’a pas pu être lu. Veuillez réessayer.',
        'No se pudo reproducir la grabación. Inténtalo de nuevo.',
        'Kayıt oynatılamadı. Lütfen tekrar deneyin.',
        'Die Aufnahme konnte nicht abgespielt werden. Bitte versuche es erneut.',
        'Impossibile riprodurre la registrazione. Riprova.',
        'Não foi possível reproduzir a gravação. Tente novamente.',
        'De opname kon niet worden afgespeeld. Probeer het opnieuw.',
        'Nie udało się odtworzyć nagrania. Spróbuj ponownie.',
        'Не удалось воспроизвести запись. Повторите попытку.',
        '録音を再生できませんでした。もう一度お試しください。',
        '녹음을 재생할 수 없습니다. 다시 시도해 주세요.',
        '无法播放录音，请重试。',
    ],
    'Unlock with Pro': [
        'Débloquer avec Pro', 'Desbloquear con Pro', 'Pro ile aç', 'Mit Pro freischalten', 'Sblocca con Pro',
        'Desbloquear com Pro', 'Ontgrendelen met Pro', 'Odblokuj z Pro', 'Открыть с Pro', 'Proで解放',
        'Pro로 잠금 해제', '使用 Pro 解锁',
    ],
    # --- Pro sheet ---
    'AI voice tours of your home': [
        'Visites audio IA de votre maison', 'Recorridos por voz con IA de tu casa',
        'Evinizin yapay zekâ sesli turları', 'KI-Audio-Touren durch dein Zuhause',
        'Tour vocali IA della tua casa', 'Tours por voz com IA da sua casa', 'AI-audiotours door je huis',
        'Wycieczki głosowe AI po twoim domu', 'Голосовые ИИ-туры по вашему дому', 'ご自宅のAI音声ツアー',
        '우리 집 AI 음성 투어', '住宅 AI 语音导览',
    ],
    'Pro can turn your plan into a narrated audio tour. Each tour uses AI points. Sign-in and internet required.': [
        'Pro peut transformer votre plan en visite audio commentée. Chaque visite utilise des points IA. Connexion au compte et à Internet requise.',
        'Pro puede convertir tu plano en un recorrido narrado. Cada recorrido usa puntos de IA. Se requiere iniciar sesión y conexión a internet.',
        'Pro, planınızı sesli anlatımlı bir tura dönüştürebilir. Her tur yapay zekâ puanı kullanır. Giriş ve internet gerekir.',
        'Pro kann deinen Plan in einen gesprochenen Rundgang verwandeln. Jede Tour verwendet KI-Punkte. Anmeldung und Internet erforderlich.',
        'Pro può trasformare il tuo progetto in un tour audio narrato. Ogni tour usa punti IA. Sono richiesti accesso e connessione Internet.',
        'O Pro pode transformar a sua planta num tour narrado. Cada tour usa pontos de IA. É necessário iniciar sessão e ter internet.',
        'Pro kan je ontwerp omzetten in een ingesproken rondleiding. Elke tour gebruikt AI-punten. Inloggen en internet zijn vereist.',
        'Pro może zamienić twój plan w narracyjną wycieczkę audio. Każda wycieczka zużywa punkty AI. Wymagane jest logowanie i internet.',
        'Pro может превратить ваш план в озвученную аудиоэкскурсию. Каждый тур использует ИИ-баллы. Требуются вход в аккаунт и интернет.',
        'Proならプランをナレーション付きの音声ツアーにできます。ツアーごとにAIポイントを使用します。ログインとインターネット接続が必要です。',
        'Pro는 도면을 내레이션이 담긴 음성 투어로 만들어 드립니다. 투어마다 AI 포인트를 사용합니다. 로그인과 인터넷 연결이 필요합니다.',
        'Pro 可以把您的平面图变成带解说的语音导览。每次导览使用 AI积分。需要登录并连接互联网。',
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
