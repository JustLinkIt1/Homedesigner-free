# Batch 4: PDF plan-pack strings (summary page + opening schedule labels).
import os
LANGS = ['fr','es','tr','de','it','pt','nl','pl','ru','ja','ko','zh']
ROOT = os.path.join(os.path.dirname(__file__), '..', 'src', 'locales')
# key -> [fr, es, tr, de, it, pt, nl, pl, ru, ja, ko, zh]
KEYS = {
  'Summary': ['Résumé','Resumen','Özet','Zusammenfassung','Riepilogo','Resumo','Overzicht','Podsumowanie','Сводка','概要','요약','摘要'],
  'Floor total': ['Total de l’étage','Total de la planta','Kat toplamı','Summe Etage','Totale piano','Total do piso','Totaal verdieping','Suma piętra','Итого по этажу','フロア合計','층 합계','楼层合计'],
  'Total living area': ['Surface habitable totale','Superficie habitable total','Toplam yaşam alanı','Gesamtwohnfläche','Superficie abitabile totale','Área habitável total','Totale woonoppervlakte','Całkowita powierzchnia mieszkalna','Общая жилая площадь','総居住面積','총 주거 면적','总居住面积'],
  'Single door': ['Porte simple','Puerta simple','Tek kanatlı kapı','Einflügelige Tür','Porta singola','Porta simples','Enkele deur','Drzwi pojedyncze','Одностворчатая дверь','片開きドア','외짝문','单开门'],
  'Double door': ['Porte double','Puerta doble','Çift kanatlı kapı','Doppeltür','Porta doppia','Porta dupla','Dubbele deur','Drzwi podwójne','Двустворчатая дверь','両開きドア','양개문','双开门'],
  'Sliding door': ['Porte coulissante','Puerta corredera','Sürgülü kapı','Schiebetür','Porta scorrevole','Porta de correr','Schuifdeur','Drzwi przesuwne','Раздвижная дверь','引き戸','미닫이문','推拉门'],
  'Pocket door': ['Porte à galandage','Puerta corredera empotrada','Duvar içi sürgülü kapı','Schiebetür in der Wand','Porta a scomparsa','Porta embutida','Schuifdeur in de wand','Drzwi chowane w ścianę','Дверь-пенал','引き込み戸','포켓 도어','暗藏式推拉门'],
  'Bi-fold door': ['Porte pliante','Puerta plegable','Katlanır kapı','Falttür','Porta a soffietto','Porta dobrável','Vouwdeur','Drzwi składane','Складная дверь','折れ戸','접이문','折叠门'],
  'Passage': ['Passage','Paso','Geçiş','Durchgang','Passaggio','Passagem','Doorgang','Przejście','Проём','通路','통로','通道'],
  'Arch': ['Arche','Arco','Kemer','Bogen','Arco','Arco','Boog','Łuk','Арка','アーチ','아치','拱门'],
  'Window': ['Fenêtre','Ventana','Pencere','Fenster','Finestra','Janela','Raam','Okno','Окно','窓','창문','窗户'],
  'French window': ['Porte-fenêtre','Puerta ventana','Fransız penceresi','Fenstertür','Porta-finestra','Porta-janela','Openslaande deur','Okno balkonowe','Французское окно','掃き出し窓','프렌치 창','落地窗'],
  'Casement window': ['Fenêtre à battant','Ventana batiente','Kanatlı pencere','Flügelfenster','Finestra a battente','Janela de batente','Draairaam','Okno rozwierne','Створчатое окно','開き窓','여닫이 창','平开窗'],
  'Sliding window': ['Fenêtre coulissante','Ventana corredera','Sürgülü pencere','Schiebefenster','Finestra scorrevole','Janela de correr','Schuifraam','Okno przesuwne','Раздвижное окно','引き違い窓','미닫이 창','推拉窗'],
}
for i, lang in enumerate(LANGS):
    path = os.path.join(ROOT, f'{lang}.ts')
    src = open(path, encoding='utf-8').read()
    added = 0
    for key, vals in KEYS.items():
        qkey = key.replace("'", "\\'")
        if f"'{qkey}':" in src or f'"{key}":' in src or f'  {key}:' in src:
            continue
        qval = vals[i].replace("'", "\\'")
        idx = src.rstrip().rfind('};')
        src = src[:idx] + f"  '{qkey}': '{qval}',\n}};" + src.rstrip()[idx+2:] + '\n'
        added += 1
    open(path, 'w', encoding='utf-8').write(src)
    print(lang, added)
print('batch4 done')
