# Batch 10: 3D graphics quality tier (Settings).
import os
LANGS = ['fr','es','tr','de','it','pt','nl','pl','ru','ja','ko','zh']
ROOT = os.path.join(os.path.dirname(__file__), '..', 'src', 'locales')
KEYS = {
  '3D graphics': ['Graphismes 3D','Gráficos 3D','3B grafikler','3D-Grafik','Grafica 3D','Gráficos 3D','3D-graphics','Grafika 3D','3D-графика','3D グラフィック','3D 그래픽','3D 图形'],
  'Auto': ['Auto','Automático','Otomatik','Automatisch','Automatico','Automático','Automatisch','Automatycznie','Авто','自動','자동','自动'],
  'Battery saver': ['Économie de batterie','Ahorro de batería','Pil tasarrufu','Energiesparen','Risparmio batteria','Economia de bateria','Batterijbesparing','Oszczędzanie baterii','Экономия батареи','バッテリー節約','배터리 절약','省电模式'],
  'Balanced': ['Équilibré','Equilibrado','Dengeli','Ausgewogen','Bilanciato','Equilibrado','Gebalanceerd','Zrównoważone','Сбалансированно','バランス','균형','均衡'],
  'Best looking': ['Qualité maximale','Máxima calidad','En iyi görünüm','Beste Qualität','Qualità massima','Melhor qualidade','Beste kwaliteit','Najlepsza jakość','Максимальное качество','高画質','최고 화질','最佳画质'],
  'Matched to your device': ['Adapté à votre appareil','Ajustado a tu dispositivo','Cihazınıza göre ayarlandı','An dein Gerät angepasst','Adattato al tuo dispositivo','Ajustado ao seu aparelho','Afgestemd op je apparaat','Dopasowane do urządzenia','Подобрано под ваше устройство','お使いの端末に合わせて調整','기기에 맞게 설정됨','已根据您的设备调整'],
  'Higher settings add shadows and detail but use more battery.': [
    'Les réglages élevés ajoutent ombres et détails mais consomment plus de batterie.',
    'Los ajustes altos añaden sombras y detalle, pero gastan más batería.',
    'Yüksek ayarlar gölge ve ayrıntı ekler ancak daha çok pil harcar.',
    'Höhere Einstellungen bringen Schatten und Details, verbrauchen aber mehr Akku.',
    'Le impostazioni alte aggiungono ombre e dettagli ma consumano più batteria.',
    'Configurações altas adicionam sombras e detalhes, mas gastam mais bateria.',
    'Hogere instellingen geven schaduwen en detail, maar kosten meer batterij.',
    'Wyższe ustawienia dodają cienie i szczegóły, ale zużywają więcej baterii.',
    'Высокие настройки добавляют тени и детализацию, но расходуют больше заряда.',
    '高い設定は影と精細さが増しますが、バッテリー消費も増えます。',
    '높은 설정은 그림자와 디테일이 좋아지지만 배터리를 더 씁니다.',
    '更高的设置会增加阴影和细节，但更耗电。',
  ],
  'Takes effect next time you open 3D.': [
    'Prend effet à la prochaine ouverture de la 3D.',
    'Se aplica la próxima vez que abras el 3D.',
    'Bir dahaki 3B açılışında geçerli olur.',
    'Wird beim nächsten Öffnen der 3D-Ansicht wirksam.',
    'Ha effetto alla prossima apertura della vista 3D.',
    'Entra em vigor na próxima vez que abrir o 3D.',
    'Wordt actief als je 3D opnieuw opent.',
    'Zadziała przy następnym otwarciu widoku 3D.',
    'Применится при следующем открытии 3D.',
    '次に 3D を開いたときに適用されます。',
    '다음에 3D를 열 때 적용됩니다.',
    '下次打开 3D 时生效。',
  ],
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
print('batch10 done')
