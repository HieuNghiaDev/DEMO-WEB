export function toVietnameseFurigana(name: string) {
  if (!name.trim() || /[\u3040-\u30ff\u3400-\u9fff]/.test(name)) return ''

  const wordMap: Record<string, string> = {
    nguyen: 'グエン', tran: 'チャン', le: 'レ', pham: 'ファム', phan: 'ファン',
    vu: 'ヴー', vo: 'ヴォ', do: 'ド', bui: 'ブイ', dang: 'ダン', ho: 'ホ',
    huynh: 'フイン', truong: 'チュオン', than: 'タン', van: 'ヴァン', thi: 'ティ',
    thu: 'トゥ', huong: 'フオン', ngoc: 'ゴック', bich: 'ビック', minh: 'ミン',
    anh: 'アイン', bao: 'バオ', gia: 'ザ', hieu: 'ヒエウ', nghia: 'ギア', say: 'サイ',
    quang: 'クアン', tuan: 'トゥアン', linh: 'リン', ha: 'ハ', nhat: 'ニャット', nam: 'ナム',
    thanh: 'タイン', binh: 'ビン', khanh: 'カイン', mai: 'マイ', lan: 'ラン', my: 'ミー',
    oanh: 'オアイン', yen: 'イエン', son: 'ソン', long: 'ロン', duc: 'ドゥック', hai: 'ハイ',
    kien: 'キエン', nhu: 'ニュー', thao: 'タオ', chau: 'チャウ', cuong: 'クオン', hong: 'ホン',
    loan: 'ロアン', tuyet: 'トゥエット', vy: 'ヴィー', xuan: 'スアン', diem: 'ディエム',
    viet: 'ヴィエット', dao: 'ダオ', thai: 'タイ', an: 'アン', tu: 'トゥ', dung: 'ズン',
    dat: 'ダット', thuy: 'トゥイ', quyen: 'クエン', nghiem: 'ギエム', khang: 'カン', hien: 'ヒエン',
    quy: 'クイ', phuc: 'フック', tam: 'タム', hanh: 'ハイン', nhung: 'ニュン', kim: 'キム',
    trinh: 'チン', hoa: 'ホア', ly: 'リー', tuy: 'トゥイ', nga: 'ガー', trieu: 'チエウ',
    thang: 'タン', trung: 'チュン', quan: 'クアン', hoang: 'ホアン', tuong: 'トゥオン',
    canh: 'カイン', nhan: 'ニャン', tai: 'タイ', khiet: 'キエット', phong: 'フォン',
  }

  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => wordMap[word] ?? word.toUpperCase())
    .join('・')
}
