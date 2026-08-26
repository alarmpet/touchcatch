import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';

const packs = [
  {
    key: 'geo-sydney-operahouse',
    theme: 'geo-sydney-operahouse',
    category: 'GENERAL_KNOWLEDGE',
    language: 'ko',
    difficulty: 'INTERMEDIATE',
    canonicalAnswer: '오페라 하우스',
    aliases: ['시드니 오페라 하우스', '오페라하우스', 'Sydney Opera House'],
    meaning: {
      prompt: '하얀 조개껍데기 모양 지붕으로 유명한 호주 시드니의 세계적인 건축물은?',
      options: [
        { id: 'opt_1', label: '오페라 하우스' },
        { id: 'opt_2', label: '타지마할' },
        { id: 'opt_3', label: '콜로세움' }
      ],
      correctOptionId: 'opt_1'
    },
    sceneBrief: '호주 시드니 항구의 푸른 바다와 하얀 조개껍데기 모양 지붕의 오페라 하우스, 하버 브리지와 요트가 어우러진 맑은 날 전경',
    wordHunts: [
      { kind: 'NORMAL', prompt: '열기구를 찾으세요', object: 'hot air balloon' },
      { kind: 'NORMAL', prompt: '세일링 요트를 찾으세요', object: 'sailboat' },
      { kind: 'SPECIAL', prompt: '해바라기 화분을 찾으세요', object: 'sunflower planter' }
    ]
  },
  {
    key: 'geo-seoul-gyeongbokgung',
    theme: 'geo-seoul-gyeongbokgung',
    category: 'GENERAL_KNOWLEDGE',
    language: 'ko',
    difficulty: 'INTERMEDIATE',
    canonicalAnswer: '경복궁',
    aliases: ['경복궁 향원정', 'Gyeongbokgung', 'Gyeongbokgung Palace'],
    meaning: {
      prompt: '가을 단풍과 아름다운 연못 향원정이 있는 대한민국 서울의 대표 궁궐은?',
      options: [
        { id: 'opt_1', label: '경복궁' },
        { id: 'opt_2', label: '자금성' },
        { id: 'opt_3', label: '베르사유 궁전' }
      ],
      correctOptionId: 'opt_1'
    },
    sceneBrief: '서울 경복궁 향원정 정자와 돌다리 연못, 오색 단풍나무와 고운 한복 차림의 나들이객이 어우러진 가을 전경',
    wordHunts: [
      { kind: 'NORMAL', prompt: '강아지를 찾으세요', object: 'puppy' },
      { kind: 'NORMAL', prompt: '비단잉어를 찾으세요', object: 'koi fish' },
      { kind: 'SPECIAL', prompt: '향원정 정자를 찾으세요', object: 'pavilion' }
    ]
  },
  {
    key: 'geo-london-bigben',
    theme: 'geo-london-bigben',
    category: 'GENERAL_KNOWLEDGE',
    language: 'ko',
    difficulty: 'INTERMEDIATE',
    canonicalAnswer: '빅벤',
    aliases: ['빅 벤', '엘리자베스 타워', 'Big Ben', 'Westminster Clock Tower'],
    meaning: {
      prompt: '영국 런던 템스 강변에 우뚝 솟은 거대한 시계탑의 별칭은?',
      options: [
        { id: 'opt_1', label: '빅벤' },
        { id: 'opt_2', label: '에펠탑' },
        { id: 'opt_3', label: '피사의 사탑' }
      ],
      correctOptionId: 'opt_1'
    },
    sceneBrief: '영국 런던 템스 강과 웨스트민스터 다리 위 빨간 2층 버스, 노을빛 하늘 아래 우뚝 솟은 빅벤 시계탑 전경',
    wordHunts: [
      { kind: 'NORMAL', prompt: '2층 버스를 찾으세요', object: 'double decker bus' },
      { kind: 'NORMAL', prompt: '공중전화부스를 찾으세요', object: 'telephone booth' },
      { kind: 'SPECIAL', prompt: '영국 근위병을 찾으세요', object: 'royal guard' }
    ]
  },
  {
    key: 'geo-tokyo-shibuya',
    theme: 'geo-tokyo-shibuya',
    category: 'GENERAL_KNOWLEDGE',
    language: 'ko',
    difficulty: 'INTERMEDIATE',
    canonicalAnswer: '시부야',
    aliases: ['도쿄 시부야', '시부야 스크램블', 'Shibuya', 'Shibuya Scramble'],
    meaning: {
      prompt: '화려한 네온 전광판과 수많은 인파가 대각선으로 건너는 도쿄의 유명 교차로는?',
      options: [
        { id: 'opt_1', label: '시부야' },
        { id: 'opt_2', label: '타임스스퀘어' },
        { id: 'opt_3', label: '샹젤리제' }
      ],
      correctOptionId: 'opt_1'
    },
    sceneBrief: '도쿄 시부야 스크램블 교차로의 화려한 네온 전광판 빌딩과 대각선 횡단보도를 건너는 인파, 하치코 동상과 자판기 풍경',
    wordHunts: [
      { kind: 'NORMAL', prompt: '하치코 동상을 찾으세요', object: 'Hachiko statue' },
      { kind: 'NORMAL', prompt: '음료수 자판기를 찾으세요', object: 'vending machine' },
      { kind: 'SPECIAL', prompt: '자전거를 찾으세요', object: 'bicycle' }
    ]
  },
  {
    key: 'geo-newyork-liberty',
    theme: 'geo-newyork-liberty',
    category: 'GENERAL_KNOWLEDGE',
    language: 'ko',
    difficulty: 'INTERMEDIATE',
    canonicalAnswer: '자유의 여신상',
    aliases: ['자유의여신상', '리버티 여신상', 'Statue of Liberty'],
    meaning: {
      prompt: '미국 뉴욕 리버티 섬에 세워진 오른손에 횃불을 든 거대한 조각상은?',
      options: [
        { id: 'opt_1', label: '자유의 여신상' },
        { id: 'opt_2', label: '에펠탑' },
        { id: 'opt_3', label: '예수구원자상' }
      ],
      correctOptionId: 'opt_1'
    },
    sceneBrief: '뉴욕 항구의 푸른 바다 위 오른손에 횃불을 높이 든 청동빛 자유의 여신상과 맨해튼 스카이라인, 페리선과 브루클린 다리 전경',
    wordHunts: [
      { kind: 'NORMAL', prompt: '비행선을 찾으세요', object: 'blimp' },
      { kind: 'NORMAL', prompt: '페리선을 찾으세요', object: 'ferry boat' },
      { kind: 'SPECIAL', prompt: '전망대 쌍안경을 찾으세요', object: 'binoculars' }
    ]
  },
  {
    key: 'geo-rome-colosseum',
    theme: 'geo-rome-colosseum',
    category: 'GENERAL_KNOWLEDGE',
    language: 'ko',
    difficulty: 'INTERMEDIATE',
    canonicalAnswer: '콜로세움',
    aliases: ['로마 콜로세움', '콜롯세움', 'Colosseum'],
    meaning: {
      prompt: '고대 로마 제국 시대의 웅장한 원형 투기장 랜드마크는?',
      options: [
        { id: 'opt_1', label: '콜로세움' },
        { id: 'opt_2', label: '파르테논 신전' },
        { id: 'opt_3', label: '사그라다 파밀리아' }
      ],
      correctOptionId: 'opt_1'
    },
    sceneBrief: '이탈리아 로마의 고대 콜로세움 원형 경기장과 조약돌 광장의 젤라토 카트, 베스파 스쿠터, 사자 분수대와 테라스 카페 풍경',
    wordHunts: [
      { kind: 'NORMAL', prompt: '열기구를 찾으세요', object: 'hot air balloon' },
      { kind: 'NORMAL', prompt: '베스파 스쿠터를 찾으세요', object: 'scooter' },
      { kind: 'SPECIAL', prompt: '사자 분수대를 찾으세요', object: 'lion fountain' }
    ]
  },
  {
    key: 'geo-pisa-tower',
    theme: 'geo-pisa-tower',
    category: 'GENERAL_KNOWLEDGE',
    language: 'ko',
    difficulty: 'INTERMEDIATE',
    canonicalAnswer: '피사의 사탑',
    aliases: ['피사의사탑', '피사 탑', 'Leaning Tower of Pisa'],
    meaning: {
      prompt: '기울어진 모양으로 세계적인 명소가 된 이탈리아 피사의 하얀 대리석 종탑은?',
      options: [
        { id: 'opt_1', label: '피사의 사탑' },
        { id: 'opt_2', label: '에펠탑' },
        { id: 'opt_3', label: '빅벤' }
      ],
      correctOptionId: 'opt_1'
    },
    sceneBrief: '이탈리아 피사 미라콜리 광장의 푸른 잔디밭 위 비스듬히 기울어진 하얀 대리석 피사의 사탑과 분수대, 자전거 풍경',
    wordHunts: [
      { kind: 'NORMAL', prompt: '노란 깃발을 찾으세요', object: 'yellow flag' },
      { kind: 'NORMAL', prompt: '자전거를 찾으세요', object: 'bicycle' },
      { kind: 'SPECIAL', prompt: '아이스크림 카트를 찾으세요', object: 'ice cream cart' }
    ]
  },
  {
    key: 'geo-cairo-pyramids',
    theme: 'geo-cairo-pyramids',
    category: 'GENERAL_KNOWLEDGE',
    language: 'ko',
    difficulty: 'INTERMEDIATE',
    canonicalAnswer: '피라미드',
    aliases: ['기자의 피라미드', '피라미드와 스핑크스', 'Pyramids of Giza', 'Great Pyramid'],
    meaning: {
      prompt: '사막 위에 우뚝 솟은 거대한 사각뿔 모양의 고대 이집트 왕들의 무덤 건축물은?',
      options: [
        { id: 'opt_1', label: '피라미드' },
        { id: 'opt_2', label: '스톤헨지' },
        { id: 'opt_3', label: '파르테논 신전' }
      ],
      correctOptionId: 'opt_1'
    },
    sceneBrief: '황금빛 일몰이 지는 이집트 사막의 거대한 기자의 대피라미드와 스핑크스, 오아시스 야자수와 낙타, 베두인 텐트 전경',
    wordHunts: [
      { kind: 'NORMAL', prompt: '황금 캡스톤을 찾으세요', object: 'golden pyramidion' },
      { kind: 'NORMAL', prompt: '낙타를 찾으세요', object: 'camel' },
      { kind: 'SPECIAL', prompt: '보물상자를 찾으세요', object: 'treasure chest' }
    ]
  },
  {
    key: 'geo-agra-tajmahal',
    theme: 'geo-agra-tajmahal',
    category: 'GENERAL_KNOWLEDGE',
    language: 'ko',
    difficulty: 'INTERMEDIATE',
    canonicalAnswer: '타지마할',
    aliases: ['아그라 타지마할', '타지 마할', 'Taj Mahal'],
    meaning: {
      prompt: '순백의 대리석 돔과 4개의 첨탑, 반사 연못이 아름다운 인도의 대표 이슬람 건축물은?',
      options: [
        { id: 'opt_1', label: '타지마할' },
        { id: 'opt_2', label: '앙코르와트' },
        { id: 'opt_3', label: '부르즈 할리파' }
      ],
      correctOptionId: 'opt_1'
    },
    sceneBrief: '일출의 아침 햇살을 받는 인도 아그라의 순백색 대리석 타지마할 궁전과 반사 연못, 연꽃과 사리 옷차림의 관람객 전경',
    wordHunts: [
      { kind: 'NORMAL', prompt: '공작새를 찾으세요', object: 'peacock' },
      { kind: 'NORMAL', prompt: '연꽃을 찾으세요', object: 'lotus flower' },
      { kind: 'SPECIAL', prompt: '은색 등불을 찾으세요', object: 'lantern' }
    ]
  },
  {
    key: 'geo-singapore-merlion',
    theme: 'geo-singapore-merlion',
    category: 'GENERAL_KNOWLEDGE',
    language: 'ko',
    difficulty: 'INTERMEDIATE',
    canonicalAnswer: '머라이언',
    aliases: ['싱가포르 머라이언', '머라이언 상', 'Merlion'],
    meaning: {
      prompt: '사자 머리에 물고기 몸통을 하고 입에서 물을 뿜는 싱가포르의 상징 석상은?',
      options: [
        { id: 'opt_1', label: '머라이언' },
        { id: 'opt_2', label: '스핑크스' },
        { id: 'opt_3', label: '해태' }
      ],
      correctOptionId: 'opt_1'
    },
    sceneBrief: '싱가포르 마리나 베이의 석양과 레이저 쇼를 배경으로 물을 힘차게 뿜는 하얀 머라이언 석상과 마리나베이샌즈 호텔 전경',
    wordHunts: [
      { kind: 'NORMAL', prompt: '유람선을 찾으세요', object: 'cruise boat' },
      { kind: 'NORMAL', prompt: '슈퍼트리를 찾으세요', object: 'supertree' },
      { kind: 'SPECIAL', prompt: '머라이언 상을 찾으세요', object: 'Merlion statue' }
    ]
  },
  {
    key: 'geo-barcelona-sagrada',
    theme: 'geo-barcelona-sagrada',
    category: 'GENERAL_KNOWLEDGE',
    language: 'ko',
    difficulty: 'INTERMEDIATE',
    canonicalAnswer: '사그라다 파밀리아',
    aliases: ['사그라다파밀리아', '성가족 성당', 'Sagrada Familia'],
    meaning: {
      prompt: '스페인 바르셀로나에 위치한 안토니 가우디가 설계한 독창적인 대성당은?',
      options: [
        { id: 'opt_1', label: '사그라다 파밀리아' },
        { id: 'opt_2', label: '노트르담 대성당' },
        { id: 'opt_3', label: '밀라노 대성당' }
      ],
      correctOptionId: 'opt_1'
    },
    sceneBrief: '스페인 바르셀로나의 맑은 아침 햇살을 받는 사그라다 파밀리아 성당의 독창적인 첨탑들과 공원 연못, 기타 연주자 풍경',
    wordHunts: [
      { kind: 'NORMAL', prompt: '기타 연주자를 찾으세요', object: 'guitar player' },
      { kind: 'NORMAL', prompt: '해바라기 화분을 찾으세요', object: 'sunflower pot' },
      { kind: 'SPECIAL', prompt: '앵무새를 찾으세요', object: 'parrot' }
    ]
  },
  {
    key: 'geo-beijing-greatwall',
    theme: 'geo-beijing-greatwall',
    category: 'GENERAL_KNOWLEDGE',
    language: 'ko',
    difficulty: 'INTERMEDIATE',
    canonicalAnswer: '만리장성',
    aliases: ['중국 만리장성', 'Great Wall', 'Great Wall of China'],
    meaning: {
      prompt: '가파른 산맥 능선을 따라 끝없이 이어진 중국의 세계 최장 석조 성벽 유적은?',
      options: [
        { id: 'opt_1', label: '만리장성' },
        { id: 'opt_2', label: '베를린 장벽' },
        { id: 'opt_3', label: '하드리아누스 방벽' }
      ],
      correctOptionId: 'opt_1'
    },
    sceneBrief: '중국 베이징의 웅장한 가을 산맥 능선을 따라 굽이치는 석조 만리장성과 망루, 붉은 깃발과 비둘기 풍경',
    wordHunts: [
      { kind: 'NORMAL', prompt: '붉은 깃발을 찾으세요', object: 'red flag' },
      { kind: 'NORMAL', prompt: '망루를 찾으세요', object: 'watchtower' },
      { kind: 'SPECIAL', prompt: '청사초롱을 찾으세요', object: 'lantern' }
    ]
  },
  {
    key: 'geo-athens-parthenon',
    theme: 'geo-athens-parthenon',
    category: 'GENERAL_KNOWLEDGE',
    language: 'ko',
    difficulty: 'INTERMEDIATE',
    canonicalAnswer: '파르테논 신전',
    aliases: ['파르테논', '아테네 신전', 'Parthenon'],
    meaning: {
      prompt: '그리스 아테네 아크로폴리스 언덕 위에 세워진 고대 아테나 여신을 모신 신전은?',
      options: [
        { id: 'opt_1', label: '파르테논 신전' },
        { id: 'opt_2', label: '판테온' },
        { id: 'opt_3', label: '제우스 신전' }
      ],
      correctOptionId: 'opt_1'
    },
    sceneBrief: '그리스 아테네 아크로폴리스 언덕 위의 백색 대리석 도리아식 기둥 파르테논 신전과 올리브 나무, 지중해 바다 전경',
    wordHunts: [
      { kind: 'NORMAL', prompt: '올리브 항아리를 찾으세요', object: 'olive urn' },
      { kind: 'NORMAL', prompt: '갈매기를 찾으세요', object: 'seagull' },
      { kind: 'SPECIAL', prompt: '황금 부조를 찾으세요', object: 'golden relief' }
    ]
  },
  {
    key: 'geo-cappadocia-valleys',
    theme: 'geo-cappadocia-valleys',
    category: 'GENERAL_KNOWLEDGE',
    language: 'ko',
    difficulty: 'INTERMEDIATE',
    canonicalAnswer: '카파도키아',
    aliases: ['괴레메 계곡', '카파도치아', 'Cappadocia'],
    meaning: {
      prompt: '버섯 모양 기암괴석과 일출 때 하늘을 가득 메우는 열기구로 유명한 튀르키예의 명소는?',
      options: [
        { id: 'opt_1', label: '카파도키아' },
        { id: 'opt_2', label: '파묵칼레' },
        { id: 'opt_3', label: '사하라 사막' }
      ],
      correctOptionId: 'opt_1'
    },
    sceneBrief: '튀르키예 카파도키아 괴레메 계곡의 버섯 바위들과 일출 하늘을 가득 채운 다채로운 열기구, 동굴 테라스 카펫 풍경',
    wordHunts: [
      { kind: 'NORMAL', prompt: '터키 카펫을 찾으세요', object: 'turkish rug' },
      { kind: 'NORMAL', prompt: '동굴 창문을 찾으세요', object: 'cave window' },
      { kind: 'SPECIAL', prompt: '도자기 주전자를 찾으세요', object: 'teapot' }
    ]
  },
  {
    key: 'geo-rio-christ',
    theme: 'geo-rio-christ',
    category: 'GENERAL_KNOWLEDGE',
    language: 'ko',
    difficulty: 'INTERMEDIATE',
    canonicalAnswer: '구세주 그리스도상',
    aliases: ['리우 예수상', '예수구원자상', 'Christ the Redeemer'],
    meaning: {
      prompt: '브라질 리우데자네이루 코르코바도 산꼭대기에서 두 팔을 벌리고 있는 거대한 조각상은?',
      options: [
        { id: 'opt_1', label: '구세주 그리스도상' },
        { id: 'opt_2', label: '자유의 여신상' },
        { id: 'opt_3', label: '스핑크스' }
      ],
      correctOptionId: 'opt_1'
    },
    sceneBrief: '브라질 리우데자네이루 코르코바도 산 정상의 거대한 구세주 그리스도상과 코파카바나 해변, 케이블카와 열대 야자수 풍경',
    wordHunts: [
      { kind: 'NORMAL', prompt: '케이블카를 찾으세요', object: 'cable car' },
      { kind: 'NORMAL', prompt: '앵무새를 찾으세요', object: 'macaw parrot' },
      { kind: 'SPECIAL', prompt: '망원경을 찾으세요', object: 'telescope' }
    ]
  },
  {
    key: 'geo-kyoto-fushimi',
    theme: 'geo-kyoto-fushimi',
    category: 'GENERAL_KNOWLEDGE',
    language: 'ko',
    difficulty: 'INTERMEDIATE',
    canonicalAnswer: '후시미 이나리',
    aliases: ['후시미이나리', '여우 신사', 'Fushimi Inari'],
    meaning: {
      prompt: '수천 개의 붉은 토리이(기둥 문)가 끝없는 터널을 이루는 일본 교토의 신사는?',
      options: [
        { id: 'opt_1', label: '후시미 이나리' },
        { id: 'opt_2', label: '센소지' },
        { id: 'opt_3', label: '금각사' }
      ],
      correctOptionId: 'opt_1'
    },
    sceneBrief: '일본 교토 후시미 이나리 신사의 끝없이 이어진 주홍색 토리이 터널과 여우 석상, 석등과 대나무 숲 풍경',
    wordHunts: [
      { kind: 'NORMAL', prompt: '여우 석상을 찾으세요', object: 'fox statue' },
      { kind: 'NORMAL', prompt: '석등을 찾으세요', object: 'stone lantern' },
      { kind: 'SPECIAL', prompt: '종이 부적을 찾으세요', object: 'paper charm' }
    ]
  },
  {
    key: 'geo-venice-grandcanal',
    theme: 'geo-venice-grandcanal',
    category: 'GENERAL_KNOWLEDGE',
    language: 'ko',
    difficulty: 'INTERMEDIATE',
    canonicalAnswer: '베네치아 대운하',
    aliases: ['베네치아 운하', '리알토 다리', 'Grand Canal', 'Rialto Bridge'],
    meaning: {
      prompt: '곤돌라가 떠다니는 수로와 유서 깊은 리알토 다리로 유명한 이탈리아의 물의 도시는?',
      options: [
        { id: 'opt_1', label: '베네치아 대운하' },
        { id: 'opt_2', label: '암스테르담 운하' },
        { id: 'opt_3', label: '템스강' }
      ],
      correctOptionId: 'opt_1'
    },
    sceneBrief: '이탈리아 베네치아 대운하를 가로지르는 리알토 다리와 곤돌라, 파스텔톤 수상 가옥들과 가면 상점 풍경',
    wordHunts: [
      { kind: 'NORMAL', prompt: '곤돌라를 찾으세요', object: 'gondola' },
      { kind: 'NORMAL', prompt: '베네치아 가면을 찾으세요', object: 'carnival mask' },
      { kind: 'SPECIAL', prompt: '줄무늬 기둥을 찾으세요', object: 'striped pole' }
    ]
  },
  {
    key: 'geo-moscow-basil',
    theme: 'geo-moscow-basil',
    category: 'GENERAL_KNOWLEDGE',
    language: 'ko',
    difficulty: 'INTERMEDIATE',
    canonicalAnswer: '성 바실리 대성당',
    aliases: ['성바실리 대성당', '바실리 성당', 'Saint Basil Cathedral'],
    meaning: {
      prompt: '알록달록한 양파 모양 돔 지붕탑으로 유명한 러시아 모스크바 붉은 광장의 성당은?',
      options: [
        { id: 'opt_1', label: '성 바실리 대성당' },
        { id: 'opt_2', label: '성 베드로 대성당' },
        { id: 'opt_3', label: '웨스트민스터 사원' }
      ],
      correctOptionId: 'opt_1'
    },
    sceneBrief: '러시아 모스크바 붉은 광장의 눈 덮인 조약돌 바닥과 동화 같은 알록달록 양파 돔의 성 바실리 대성당 전경',
    wordHunts: [
      { kind: 'NORMAL', prompt: '마트료시카를 찾으세요', object: 'matryoshka' },
      { kind: 'NORMAL', prompt: '황금 십자가를 찾으세요', object: 'golden cross' },
      { kind: 'SPECIAL', prompt: '가로등을 찾으세요', object: 'streetlight' }
    ]
  },
  {
    key: 'geo-machupicchu-ruins',
    theme: 'geo-machupicchu-ruins',
    category: 'GENERAL_KNOWLEDGE',
    language: 'ko',
    difficulty: 'INTERMEDIATE',
    canonicalAnswer: '마추픽추',
    aliases: ['페루 마추픽추', '잉카 공중도시', 'Machu Picchu'],
    meaning: {
      prompt: '안데스 산맥 해발 2,430m 절벽 위에 건설된 잉카 제국의 신비로운 공중도시는?',
      options: [
        { id: 'opt_1', label: '마추픽추' },
        { id: 'opt_2', label: '치첸이차' },
        { id: 'opt_3', label: '페트라' }
      ],
      correctOptionId: 'opt_1'
    },
    sceneBrief: '페루 안데스 구름 낀 와이나픽추 산봉우리 아래 잉카 제국의 계단식 석조 공중도시 마추픽추와 라마 풍경',
    wordHunts: [
      { kind: 'NORMAL', prompt: '하얀 라마를 찾으세요', object: 'llama' },
      { kind: 'NORMAL', prompt: '잉카 깃발을 찾으세요', object: 'Inca flag' },
      { kind: 'SPECIAL', prompt: '초가지붕을 찾으세요', object: 'thatched roof' }
    ]
  },
  {
    key: 'geo-dubai-burjkhalifa',
    theme: 'geo-dubai-burjkhalifa',
    category: 'GENERAL_KNOWLEDGE',
    language: 'ko',
    difficulty: 'INTERMEDIATE',
    canonicalAnswer: '부르즈 할리파',
    aliases: ['부르즈할리파', '버즈 칼리파', 'Burj Khalifa'],
    meaning: {
      prompt: '아랍에미리트 두바이에 위치한 높이 828m의 세계 최고층 빌딩은?',
      options: [
        { id: 'opt_1', label: '부르즈 할리파' },
        { id: 'opt_2', label: '타이베이 101' },
        { id: 'opt_3', label: '엠파이어 스테이트 빌딩' }
      ],
      correctOptionId: 'opt_1'
    },
    sceneBrief: 'UAE 두바이의 화려한 야경 속 은빛으로 하늘을 찌르는 828m 초고층 부르즈 할리파와 웅장한 두바이 분수 쇼 전경',
    wordHunts: [
      { kind: 'NORMAL', prompt: '분수 물줄기를 찾으세요', object: 'fountain jet' },
      { kind: 'NORMAL', prompt: '요트를 찾으세요', object: 'yacht' },
      { kind: 'SPECIAL', prompt: '초승달을 찾으세요', object: 'crescent moon' }
    ]
  },
  {
    key: 'geo-paris-eiffel',
    theme: 'geo-paris-eiffel',
    category: 'GENERAL_KNOWLEDGE',
    language: 'ko',
    difficulty: 'INTERMEDIATE',
    canonicalAnswer: '에펠탑',
    aliases: ['파리 에펠탑', 'Eiffel Tower', 'Tour Eiffel'],
    meaning: {
      prompt: '프랑스 파리의 상징이자 1889년 만국 박람회를 위해 건설된 세계적인 철골 탑은?',
      options: [
        { id: 'opt_1', label: '에펠탑' },
        { id: 'opt_2', label: '개선문' },
        { id: 'opt_3', label: '루브르 박물관' }
      ],
      correctOptionId: 'opt_1'
    },
    sceneBrief: '프랑스 파리 세느강변과 샹드마르스 공원에서 올려다본 장엄한 에펠탑과 노천카페, 회전목마 저녁 노을 전경',
    wordHunts: [
      { kind: 'NORMAL', prompt: '유람선을 찾으세요', object: 'boat' },
      { kind: 'NORMAL', prompt: '회전목마를 찾으세요', object: 'carousel' },
      { kind: 'SPECIAL', prompt: '프랑스 국기를 찾으세요', object: 'French flag' }
    ]
  },
  {
    key: 'geo-sanfrancisco-goldengate',
    theme: 'geo-sanfrancisco-goldengate',
    category: 'GENERAL_KNOWLEDGE',
    language: 'ko',
    difficulty: 'INTERMEDIATE',
    canonicalAnswer: '금문교',
    aliases: ['샌프란시스코 금문교', '골든게이트교', 'Golden Gate Bridge'],
    meaning: {
      prompt: '미국 샌프란시스코 만을 가로지르는 붉은 주탑의 세계적으로 유명한 현수교는?',
      options: [
        { id: 'opt_1', label: '금문교' },
        { id: 'opt_2', label: '브루클린 브리지' },
        { id: 'opt_3', label: '타워브리지' }
      ],
      correctOptionId: 'opt_1'
    },
    sceneBrief: '미국 샌프란시스코 만의 푸른 바다와 붉은색 거대 현수교 금문교, 항해하는 요트와 케이블카 전경',
    wordHunts: [
      { kind: 'NORMAL', prompt: '세일링 요트를 찾으세요', object: 'sailboat' },
      { kind: 'NORMAL', prompt: '케이블카를 찾으세요', object: 'cable car' },
      { kind: 'SPECIAL', prompt: '바다사자를 찾으세요', object: 'sea lion' }
    ]
  },
  {
    key: 'geo-germany-neuschwanstein',
    theme: 'geo-germany-neuschwanstein',
    category: 'GENERAL_KNOWLEDGE',
    language: 'ko',
    difficulty: 'INTERMEDIATE',
    canonicalAnswer: '노이슈반슈타인 성',
    aliases: ['노이슈반슈타인성', '백조의 성', 'Neuschwanstein Castle'],
    meaning: {
      prompt: '디즈니 신데렐라 성의 모티브가 된 독일 바이에른 알프스 숲속의 동화 같은 성은?',
      options: [
        { id: 'opt_1', label: '노이슈반슈타인 성' },
        { id: 'opt_2', label: '호엔촐레른 성' },
        { id: 'opt_3', label: '몽생미셸' }
      ],
      correctOptionId: 'opt_1'
    },
    sceneBrief: '독일 퓌센 알프스 산림 속에 우뚝 솟은 동화 같은 하얀 백조의 성 노이슈반슈타인과 마차 풍경',
    wordHunts: [
      { kind: 'NORMAL', prompt: '마차를 찾으세요', object: 'carriage' },
      { kind: 'NORMAL', prompt: '독수리를 찾으세요', object: 'eagle' },
      { kind: 'SPECIAL', prompt: '풍향계를 찾으세요', object: 'weather vane' }
    ]
  },
  {
    key: 'geo-jordan-petra',
    theme: 'geo-jordan-petra',
    category: 'GENERAL_KNOWLEDGE',
    language: 'ko',
    difficulty: 'INTERMEDIATE',
    canonicalAnswer: '페트라',
    aliases: ['요르단 페트라', '알 카즈네', 'Petra'],
    meaning: {
      prompt: '붉은 사암 협곡을 깎아 만든 고대 나바테아 왕국의 신비로운 장미빛 유적 도시는?',
      options: [
        { id: 'opt_1', label: '페트라' },
        { id: 'opt_2', label: '피라미드' },
        { id: 'opt_3', label: '팔미라' }
      ],
      correctOptionId: 'opt_1'
    },
    sceneBrief: '요르단 붉은 사암 협곡 시크 틈새로 웅장하게 드러나는 고대 신전 알 카즈네와 낙타 풍경',
    wordHunts: [
      { kind: 'NORMAL', prompt: '낙타를 찾으세요', object: 'camel' },
      { kind: 'NORMAL', prompt: '사막 램프를 찾으세요', object: 'lamp' },
      { kind: 'SPECIAL', prompt: '사막 매를 찾으세요', object: 'falcon' }
    ]
  },
  {
    key: 'geo-netherlands-windmills',
    theme: 'geo-netherlands-windmills',
    category: 'GENERAL_KNOWLEDGE',
    language: 'ko',
    difficulty: 'INTERMEDIATE',
    canonicalAnswer: '풍차 마을',
    aliases: ['잔세스칸스', '네덜란드 풍차', 'Zaanse Schans'],
    meaning: {
      prompt: '거대한 목조 풍차들과 형형색색의 튤립 꽃밭, 나막신으로 유명한 네덜란드의 대표 명소는?',
      options: [
        { id: 'opt_1', label: '풍차 마을' },
        { id: 'opt_2', label: '암스테르담 운하' },
        { id: 'opt_3', label: '큐켄호프' }
      ],
      correctOptionId: 'opt_1'
    },
    sceneBrief: '네덜란드 잔세스칸스 운하를 따라 늘어선 거대한 녹색 목조 풍차와 만발한 튤립 꽃밭, 자전거 풍경',
    wordHunts: [
      { kind: 'NORMAL', prompt: '자전거를 찾으세요', object: 'bicycle' },
      { kind: 'NORMAL', prompt: '노란 나막신을 찾으세요', object: 'wooden clogs' },
      { kind: 'SPECIAL', prompt: '튤립 꽃밭을 찾으세요', object: 'tulip field' }
    ]
  },
  {
    key: 'geo-bali-temple',
    theme: 'geo-bali-temple',
    category: 'GENERAL_KNOWLEDGE',
    language: 'ko',
    difficulty: 'INTERMEDIATE',
    canonicalAnswer: '울룬 다누 사원',
    aliases: ['발리 울룬다누', '브라탄 사원', 'Ulun Danu Beratan'],
    meaning: {
      prompt: '인도네시아 발리 브라탄 호수 위에 떠 있는 듯한 신비로운 11층 다층 목조 수상 사원은?',
      options: [
        { id: 'opt_1', label: '울룬 다누 사원' },
        { id: 'opt_2', label: '타나롯 사원' },
        { id: 'opt_3', label: '앙코르와트' }
      ],
      correctOptionId: 'opt_1'
    },
    sceneBrief: '인도네시아 발리 고산 호수 브라탄 위에 세워진 신비로운 수상 힌두 사원 울룬 다누와 전통 목조 카누 풍경',
    wordHunts: [
      { kind: 'NORMAL', prompt: '목조 카누를 찾으세요', object: 'canoe' },
      { kind: 'NORMAL', prompt: '열대 연꽃을 찾으세요', object: 'lotus' },
      { kind: 'SPECIAL', prompt: '전통 깃발을 찾으세요', object: 'Balinese penjor flag' }
    ]
  },
  {
    key: 'geo-mexico-chichenitza',
    theme: 'geo-mexico-chichenitza',
    category: 'GENERAL_KNOWLEDGE',
    language: 'ko',
    difficulty: 'INTERMEDIATE',
    canonicalAnswer: '치첸이트사',
    aliases: ['치첸이차', '쿠쿨칸 피라미드', 'Chichen Itza'],
    meaning: {
      prompt: '멕시코 유카탄 반도에 위치한 마야 문명의 웅장한 4면 365계단 피라미드 신전 유적은?',
      options: [
        { id: 'opt_1', label: '치첸이트사' },
        { id: 'opt_2', label: '테오티우아칸' },
        { id: 'opt_3', label: '티칼' }
      ],
      correctOptionId: 'opt_1'
    },
    sceneBrief: '멕시코 유카탄 정글 속 마야 문명의 거대한 쿠쿨칸 피라미드 신전 엘 카스티요와 재규어 석상 풍경',
    wordHunts: [
      { kind: 'NORMAL', prompt: '솜브레로 모자를 찾으세요', object: 'sombrero' },
      { kind: 'NORMAL', prompt: '재규어 석상을 찾으세요', object: 'jaguar statue' },
      { kind: 'SPECIAL', prompt: '무지개 앵무새를 찾으세요', object: 'macaw' }
    ]
  },
  {
    key: 'geo-canada-banfflake',
    theme: 'geo-canada-banfflake',
    category: 'GENERAL_KNOWLEDGE',
    language: 'ko',
    difficulty: 'INTERMEDIATE',
    canonicalAnswer: '레이크 루이스',
    aliases: ['루이스 호수', '밴프 레이크루이스', 'Lake Louise Banff'],
    meaning: {
      prompt: '캐나다 밴프 국립공원에 위치한 만년설 로키 산맥과 에메랄드빛 빙하 호수로 유명한 곳은?',
      options: [
        { id: 'opt_1', label: '레이크 루이스' },
        { id: 'opt_2', label: '나이아가라 폭포' },
        { id: 'opt_3', label: '모레인 호수' }
      ],
      correctOptionId: 'opt_1'
    },
    sceneBrief: '캐나다 로키 산맥 만년설 빅토리아 빙하 아래 에메랄드빛 영롱한 레이크 루이스와 빨간 카누 풍경',
    wordHunts: [
      { kind: 'NORMAL', prompt: '빨간 카누를 찾으세요', object: 'red canoe' },
      { kind: 'NORMAL', prompt: '통나무집을 찾으세요', object: 'boathouse' },
      { kind: 'SPECIAL', prompt: '캐나다 단풍 국기를 찾으세요', object: 'Canadian flag' }
    ]
  },
  {
    key: 'geo-iceland-bluelagoon',
    theme: 'geo-iceland-bluelagoon',
    category: 'GENERAL_KNOWLEDGE',
    language: 'ko',
    difficulty: 'INTERMEDIATE',
    canonicalAnswer: '블루라군',
    aliases: ['아이슬란드 블루라군', 'Blue Lagoon Iceland'],
    meaning: {
      prompt: '아이슬란드 검은 화산암 지대에 위치한 우윳빛 푸른 온천수와 밤하늘 오로라로 유명한 지열 온천은?',
      options: [
        { id: 'opt_1', label: '블루라군' },
        { id: 'opt_2', label: '굴포스' },
        { id: 'opt_3', label: '게이시르' }
      ],
      correctOptionId: 'opt_1'
    },
    sceneBrief: '아이슬란드 검은 화산암 사이로 김이 피어오르는 우윳빛 푸른 블루라군 온천과 밤하늘의 영롱한 녹색 오로라 전경',
    wordHunts: [
      { kind: 'NORMAL', prompt: '나무 다리를 찾으세요', object: 'wooden bridge' },
      { kind: 'NORMAL', prompt: '머드팩을 찾으세요', object: 'mud pack' },
      { kind: 'SPECIAL', prompt: '밤하늘 오로라를 찾으세요', object: 'aurora' }
    ]
  },
  {
    key: 'geo-vietnam-halongbay',
    theme: 'geo-vietnam-halongbay',
    category: 'GENERAL_KNOWLEDGE',
    language: 'ko',
    difficulty: 'INTERMEDIATE',
    canonicalAnswer: '하롱베이',
    aliases: ['베트남 하롱베이', 'Ha Long Bay'],
    meaning: {
      prompt: '에메랄드빛 바다 위에 1,900여 개의 기암괴석 석회암 섬들이 솟아 있는 베트남의 세계자연유산은?',
      options: [
        { id: 'opt_1', label: '하롱베이' },
        { id: 'opt_2', label: '닌빈' },
        { id: 'opt_3', label: '푸꾸옥' }
      ],
      correctOptionId: 'opt_1'
    },
    sceneBrief: '베트남 하롱베이의 에메랄드빛 바다에 솟아오른 웅장한 석회암 기암괴석 섬들과 붉은 돛 전통 정크선 풍경',
    wordHunts: [
      { kind: 'NORMAL', prompt: '붉은 돛 정크선을 찾으세요', object: 'junk boat' },
      { kind: 'NORMAL', prompt: '원뿔 모자 논라를 찾으세요', object: 'Non La hat' },
      { kind: 'SPECIAL', prompt: '베트남 국기를 찾으세요', object: 'Vietnam flag' }
    ]
  }
];

async function run() {
  for (const pack of packs) {
    const fileA = 'content/learning/source/' + pack.key + '-a.png';
    const fileB = 'content/learning/source/' + pack.key + '-b.png';
    try {
      await fs.access(fileA);
      await fs.access(fileB);
    } catch {
      continue;
    }
    const bufA = await fs.readFile(fileA);
    const bufB = await fs.readFile(fileB);
    const shaA = crypto.createHash('sha256').update(bufA).digest('hex');
    const shaB = crypto.createHash('sha256').update(bufB).digest('hex');
    
    const draft = {
      schemaVersion: '1.0.0',
      status: 'DRAFT',
      rightsReviewStatus: 'REVIEW_REQUIRED',
      educationReviewStatus: 'REVIEW_REQUIRED',
      publicContent: {
        contentId: randomUUID(),
        version: 1,
        contentRevisionId: randomUUID(),
        schemaVersion: '1.0.0',
        assetPolicyVersion: '1.0.0',
        theme: pack.theme,
        category: pack.category,
        language: pack.language,
        difficulty: pack.difficulty,
        imageA: {
          url: 'https://cdn.spot-learn.test/assets/' + shaA + '.png',
          sha256: shaA,
          encodedBytes: bufA.length,
          width: 1024,
          height: 1024,
          mimeType: 'image/png'
        },
        imageB: {
          url: 'https://cdn.spot-learn.test/assets/' + shaB + '.png',
          sha256: shaB,
          encodedBytes: bufB.length,
          width: 1024,
          height: 1024,
          mimeType: 'image/png'
        }
      },
      privateSolution: {
        contentRevisionId: randomUUID(),
        schemaVersion: '1.0.0',
        differences: []
      },
      assetFiles: {
        'imageA.png': shaA + '.png',
        'imageB.png': shaB + '.png'
      }
    };
    
    await fs.writeFile('content/learning/drafts/' + pack.key + '.json', JSON.stringify(draft, null, 2));
    console.log('Created draft for:', pack.key);
  }
}
run();
