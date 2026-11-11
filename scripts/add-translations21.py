import os
LANGS = ['fr','es','tr','de','it','pt','nl','pl','ru','ja','ko','zh']
ROOT = os.path.join(os.path.dirname(__file__), '..', 'src', 'locales')
KEYS = {
    # Short label for the phone home bar, where "Community & support" wrapped.
    'Community': [
        'Communauté', 'Comunidad', 'Topluluk', 'Community', 'Community', 'Comunidade',
        'Community', 'Społeczność', 'Сообщество', 'コミュニティ', '커뮤니티', '社区',
    ],
    # Toast after a free user saves a render or photo, and its action.
    'Saved with a watermark.': [
        'Enregistré avec un filigrane.', 'Guardado con marca de agua.', 'Filigranlı olarak kaydedildi.',
        'Mit Wasserzeichen gespeichert.', 'Salvato con filigrana.', 'Salvo com marca d’água.',
        'Opgeslagen met watermerk.', 'Zapisano ze znakiem wodnym.', 'Сохранено с водяным знаком.',
        '透かし入りで保存しました。', '워터마크가 포함된 상태로 저장되었습니다.', '已保存，带有水印。',
    ],
    'Remove watermark': [
        'Retirer le filigrane', 'Quitar la marca de agua', 'Filigranı kaldır', 'Wasserzeichen entfernen',
        'Rimuovi la filigrana', 'Remover marca d’água', 'Watermerk verwijderen', 'Usuń znak wodny',
        'Убрать водяной знак', '透かしを削除', '워터마크 제거', '去除水印',
    ],
    # Paywall blurb when it opens from that toast.
    'Pro removes the watermark from every render and photo you save or share.': [
        'Pro retire le filigrane de chaque rendu et photo que vous enregistrez ou partagez.',
        'Pro quita la marca de agua de cada render y foto que guardes o compartas.',
        'Pro, kaydettiğiniz veya paylaştığınız her render ve fotoğraftan filigranı kaldırır.',
        'Pro entfernt das Wasserzeichen von jedem Rendering und Foto, das du speicherst oder teilst.',
        'Pro rimuove la filigrana da ogni render e foto che salvi o condividi.',
        'O Pro remove a marca d’água de cada render e foto que você salvar ou compartilhar.',
        'Pro verwijdert het watermerk van elke render en foto die je opslaat of deelt.',
        'Pro usuwa znak wodny z każdego renderu i zdjęcia, które zapisujesz lub udostępniasz.',
        'Pro убирает водяной знак с каждого рендера и фото, которые вы сохраняете или отправляете.',
        'Proなら、保存・共有するすべてのレンダリングと写真から透かしが消えます。',
        'Pro는 저장하거나 공유하는 모든 렌더링과 사진에서 워터마크를 제거합니다.',
        'Pro 会去除您保存或分享的每张渲染图和照片上的水印。',
    ],
    # Home greeting before the first project exists ("Welcome back" otherwise).
    'Welcome': [
        'Bienvenue', 'Te damos la bienvenida', 'Hoş geldiniz', 'Willkommen', 'Ti diamo il benvenuto',
        'Boas-vindas', 'Welkom', 'Witamy', 'Добро пожаловать', 'ようこそ', '환영합니다', '欢迎',
    ],
}
for i, lang in enumerate(LANGS):
    path = os.path.join(ROOT, f'{lang}.ts')
    src = open(path, encoding='utf-8', newline='').read()
    nl = '\r\n' if '\r\n' in src else '\n'
    added = 0
    for key, vals in KEYS.items():
        assert len(vals) == 12, key
        qkey = key.replace("'", "\'")
        bare = key.isidentifier() and f'{nl}  {key}:' in src
        if bare or f"'{qkey}':" in src or f'"{key}":' in src:
            continue
        qval = vals[i].replace("'", "\'")
        idx = src.rstrip().rfind('};')
        src = src[:idx] + f"  '{qkey}': '{qval}',{nl}}};" + src.rstrip()[idx+2:] + nl
        added += 1
    open(path, 'w', encoding='utf-8', newline='').write(src)
    print(lang, added)
