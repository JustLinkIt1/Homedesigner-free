import os
LANGS = ['fr','es','tr','de','it','pt','nl','pl','ru','ja','ko','zh']
ROOT = os.path.join(os.path.dirname(__file__), '..', 'src', 'locales')
# AI render: watermark choice for free accounts, and the new provider consent.
# Values use the typographic apostrophe (’) only: the writer below does not
# escape ASCII quotes.
KEYS = {
    'With watermark': [
        'Avec filigrane', 'Con marca de agua', 'Filigranlı', 'Mit Wasserzeichen', 'Con filigrana',
        'Com marca d’água', 'Met watermerk', 'Ze znakiem wodnym', 'С водяным знаком',
        '透かしあり', '워터마크 포함', '带水印',
    ],
    'No watermark': [
        'Sans filigrane', 'Sin marca de agua', 'Filigransız', 'Ohne Wasserzeichen', 'Senza filigrana',
        'Sem marca d’água', 'Zonder watermerk', 'Bez znaku wodnego', 'Без водяного знака',
        '透かしなし', '워터마크 없음', '无水印',
    ],
    'With Pro, AI renders have no watermark at the lower price.': [
        'Avec Pro, les rendus IA sont sans filigrane au tarif réduit.',
        'Con Pro, los renders con IA no llevan marca de agua y cuestan menos.',
        'Pro ile yapay zekâ görselleri düşük fiyata filigransız olur.',
        'Mit Pro sind KI-Renderings ohne Wasserzeichen zum günstigeren Preis.',
        'Con Pro, i render IA sono senza filigrana al prezzo più basso.',
        'Com Pro, os renders com IA não têm marca d’água e custam menos.',
        'Met Pro hebben AI-renders geen watermerk voor de lagere prijs.',
        'Z Pro rendery AI nie mają znaku wodnego i kosztują mniej.',
        'С Pro ИИ-рендеры без водяного знака по сниженной цене.',
        'Proなら、AIレンダーは透かしなしで低価格です。',
        'Pro에서는 AI 렌더가 워터마크 없이 더 저렴합니다.',
        '使用 Pro，AI 渲染无水印且价格更低。',
    ],
    'See Pro': [
        'Voir Pro', 'Ver Pro', 'Pro’ya göz at', 'Pro ansehen', 'Scopri Pro', 'Ver Pro', 'Bekijk Pro',
        'Zobacz Pro', 'Подробнее о Pro', 'Proを見る', 'Pro 보기', '查看 Pro',
    ],
    'Send this preview to ElevenLabs or fal.ai to generate an image. No plan file or account details are sent.': [
        'Envoyer cet aperçu à ElevenLabs ou fal.ai pour générer une image. Aucun fichier de plan ni information de compte n’est envoyé.',
        'Enviar esta vista previa a ElevenLabs o fal.ai para generar una imagen. No se envía ningún archivo de plano ni datos de la cuenta.',
        'Görsel oluşturmak için bu önizlemeyi ElevenLabs veya fal.ai’ye gönder. Plan dosyası veya hesap bilgisi gönderilmez.',
        'Diese Vorschau an ElevenLabs oder fal.ai senden, um ein Bild zu erzeugen. Es werden keine Plandatei und keine Kontodaten gesendet.',
        'Invia questa anteprima a ElevenLabs o fal.ai per generare un’immagine. Non vengono inviati file di progetto né dati dell’account.',
        'Enviar esta pré-visualização para a ElevenLabs ou a fal.ai para gerar uma imagem. Nenhum ficheiro de planta nem dados da conta são enviados.',
        'Stuur deze voorvertoning naar ElevenLabs of fal.ai om een afbeelding te maken. Er worden geen ontwerpbestand of accountgegevens verzonden.',
        'Wyślij ten podgląd do ElevenLabs lub fal.ai, aby wygenerować obraz. Plik planu ani dane konta nie są wysyłane.',
        'Отправить этот предпросмотр в ElevenLabs или fal.ai для создания изображения. Файл плана и данные аккаунта не передаются.',
        'このプレビューをElevenLabsまたはfal.aiに送信して画像を生成します。プランファイルやアカウント情報は送信されません。',
        '이 미리보기를 ElevenLabs 또는 fal.ai로 보내 이미지를 생성합니다. 도면 파일이나 계정 정보는 전송되지 않습니다.',
        '将此预览发送至 ElevenLabs 或 fal.ai 以生成图像。不会发送平面图文件或账户信息。',
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
