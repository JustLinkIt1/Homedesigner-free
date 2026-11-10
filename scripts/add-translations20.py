import os
LANGS = ['fr','es','tr','de','it','pt','nl','pl','ru','ja','ko','zh']
ROOT = os.path.join(os.path.dirname(__file__), '..', 'src', 'locales')
KEYS = {
    'Everything in Pro': [
        "Tout ce qu'inclut Pro", 'Todo lo que incluye Pro', "Pro'daki her şey", 'Alles in Pro',
        'Tutto in Pro', 'Tudo no Pro', 'Alles in Pro', 'Wszystko w Pro', 'Всё в Pro',
        'Proに含まれるもの', 'Pro에 포함된 모든 것', 'Pro 包含的一切',
    ],
    'Cancel anytime.': [
        'Annulez à tout moment.', 'Cancela cuando quieras.', 'İstediğiniz zaman iptal edin.',
        'Jederzeit kündbar.', 'Annulla quando vuoi.', 'Cancele quando quiser.', 'Altijd opzegbaar.',
        'Anuluj w dowolnym momencie.', 'Отмена в любой момент.', 'いつでもキャンセルできます。',
        '언제든지 해지할 수 있습니다.', '可随时取消。',
    ],
    'Sharper, higher-resolution photos': [
        'Photos plus nettes, en haute résolution', 'Fotos más nítidas y de mayor resolución',
        'Daha net, yüksek çözünürlüklü fotoğraflar', 'Schärfere Fotos in höherer Auflösung',
        'Foto più nitide e ad alta risoluzione', 'Fotos mais nítidas e de maior resolução',
        "Scherpere foto's in hogere resolutie", 'Ostrzejsze zdjęcia w wyższej rozdzielczości',
        'Более чёткие фото в высоком разрешении', 'より鮮明な高解像度の写真', '더 선명한 고해상도 사진',
        '更清晰的高分辨率照片',
    ],
    'PDF & DXF plan export': [
        'Export des plans en PDF et DXF', 'Exportación de planos en PDF y DXF',
        'PDF ve DXF plan dışa aktarımı', 'Planexport als PDF und DXF',
        'Esportazione piante in PDF e DXF', 'Exportação de plantas em PDF e DXF',
        'Plattegronden exporteren als PDF en DXF', 'Eksport planów do PDF i DXF',
        'Экспорт планов в PDF и DXF', 'PDF・DXF形式で図面を書き出し', 'PDF 및 DXF 도면 내보내기',
        '导出 PDF 和 DXF 平面图',
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
