import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const SX_GOODS_CHANNEL_URL = 'https://mm.avito.ru/avito/channels/sx-goods'
const GOODS_MASK_URL = new URL('../Mask group.svg', import.meta.url).href

const keepShortWords = (text: string) =>
  text.replace(
    /(^|[\s(«„])((?:а|в|во|и|к|ко|о|об|от|до|за|из|на|по|но|не|ни|же|ли|бы|с|со|у|для|без|при|под|над|про|как|что|или|если|SX))\s+/giu,
    '$1$2\u00A0',
  )

type Stage = 'idea' | 'solution'
type ResultType = 'rethink' | 'approval' | 'inform'
type ScreenDecision = 'no' | 'not-checked' | 'justified'

type Criterion = {
  id: string
  label: string
  group: string
  result: ResultType
}

type GoodsPoint = {
  x: number
  y: number
  inGoods: boolean
}

function GoodsShader() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const hero = canvas.closest<HTMLElement>('.hero')
    const context = canvas.getContext('2d')
    const maskCanvas = document.createElement('canvas')
    const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true })
    const image = new Image()
    const pointer = { x: 0, y: 0, effectX: 0, effectY: 0, active: false, level: 0 }
    let animationFrame = 0
    let points: GoodsPoint[] = []
    let maskData: ImageData | null = null
    let width = 0
    let height = 0
    let dpr = 1

    if (!hero || !context || !maskContext) {
      return
    }

    const setPointer = (event: PointerEvent | MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer.x = (event.clientX - rect.left) * (width / rect.width)
      pointer.y = (event.clientY - rect.top) * (height / rect.height)
      pointer.active = event.clientX >= rect.left
        && event.clientX <= rect.right
        && event.clientY >= rect.top
        && event.clientY <= rect.bottom
    }

    const hidePointer = () => {
      pointer.active = false
    }

    const rebuildPoints = () => {
      const rect = canvas.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = Math.max(1, Math.round(rect.width))
      height = Math.max(1, Math.round(rect.height))

      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)

      maskCanvas.width = width
      maskCanvas.height = height
      maskContext.clearRect(0, 0, width, height)

      const imageRatio = image.naturalWidth / image.naturalHeight
      const markScale = width > 900 ? 1.017 : 1.384
      const drawWidth = width * markScale
      const drawHeight = drawWidth / imageRatio
      const drawX = (width - drawWidth) / 2
      const drawY = width > 900 ? -height * 0.23 : height * 0.06

      maskContext.drawImage(image, drawX, drawY, drawWidth, drawHeight)
      maskData = maskContext.getImageData(0, 0, width, height)
      points = []

      const step = width > 900 ? 14 : 12
      const gridOffset = step / 2
      const modulo = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor
      // Якорим canvas-точки к координатам страницы, а не к самому canvas.
      // Так их фаза совпадает со статичной сеткой за пределами hero.
      const startX = modulo(gridOffset - rect.left, step)
      const startY = modulo(gridOffset - rect.top, step)

      for (let y = startY; y < height; y += step) {
        for (let x = startX; x < width; x += step) {
          const sampleX = Math.max(0, Math.min(width - 1, Math.round(x)))
          const sampleY = Math.max(0, Math.min(height - 1, Math.round(y)))
          const alpha = maskData.data[(sampleY * width + sampleX) * 4 + 3]

          points.push({ x, y, inGoods: alpha > 32 })
        }
      }
    }

    const draw = (time = 0) => {
      const isPointerInCanvas = pointer.active
        && pointer.x >= 0
        && pointer.x <= width
        && pointer.y >= 0
        && pointer.y <= height

      if (isPointerInCanvas) {
        pointer.effectX = pointer.x
        pointer.effectY = pointer.y
      }

      const targetLevel = isPointerInCanvas ? 1 : 0

      pointer.level += (targetLevel - pointer.level) * 0.1

      context.clearRect(0, 0, width, height)

      const radius = width > 900 ? 190 : 138
      const baseDotSize = width > 900 ? 1.45 : 1.25
      const goodsDotSize = width > 900 ? 2.66 : 2.05

      context.globalAlpha = 1

      for (const point of points) {
        let x = point.x
        let y = point.y
        let proximity = 0
        const bottomFadeProgress = Math.max(0, Math.min(1, (height - point.y) / 120))
        const bottomFade = bottomFadeProgress * bottomFadeProgress * (3 - 2 * bottomFadeProgress)
        const interactionLevel = pointer.level * bottomFade
        const deltaX = point.x - pointer.effectX
        const deltaY = point.y - pointer.effectY
        const distanceToCursor = Math.hypot(deltaX, deltaY)

        if (distanceToCursor < radius && distanceToCursor > 0.01) {
          proximity = 1 - distanceToCursor / radius
          const localStrength = point.inGoods ? 0.3 : 0.06
          const compression = interactionLevel * localStrength * proximity * proximity

          x = pointer.effectX + deltaX * (1 - compression)
          y = pointer.effectY + deltaY * (1 - compression)
        }

        const attraction = interactionLevel * proximity * proximity
        let dotSize: number

        if (point.inGoods) {
          const reveal = attraction
          const pulseWave = (Math.sin(time * 0.0045 + point.x * 0.018 + point.y * 0.012) + 1) / 2
          const pulseActivation = width <= 900
            ? 0.5 + pointer.level * proximity * 0.45
            : 0.28 + pointer.level * proximity * 0.55
          const pulseOffset = (pulseWave - 0.5) * 16 * pulseActivation
          const red = Math.round(132 + 68 * reveal + pulseOffset)
          const green = Math.round(129 + 65 * reveal + pulseOffset)
          const blue = Math.round(122 + 60 * reveal + pulseOffset)

          context.fillStyle = `rgb(${red}, ${green}, ${blue})`
          dotSize = goodsDotSize * (1 + 0.1 * pulseWave * pulseActivation)
        } else {
          const red = Math.round(32 + 95 * attraction)
          const green = Math.round(31 + 92 * attraction)
          const blue = Math.round(29 + 87 * attraction)

          context.fillStyle = `rgb(${red}, ${green}, ${blue})`
          dotSize = baseDotSize + (goodsDotSize - baseDotSize) * attraction
        }
        context.beginPath()
        context.arc(x, y, dotSize, 0, Math.PI * 2)
        context.fill()
      }

      context.globalAlpha = 1
      animationFrame = requestAnimationFrame(draw)
    }

    image.onload = () => {
      rebuildPoints()
      animationFrame = requestAnimationFrame(draw)
    }

    image.src = GOODS_MASK_URL

    const resizeObserver = new ResizeObserver(() => {
      if (image.complete) {
        rebuildPoints()
      }
    })

    resizeObserver.observe(canvas)
    window.addEventListener('pointermove', setPointer)
    window.addEventListener('mousemove', setPointer)
    window.addEventListener('blur', hidePointer)

    return () => {
      cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      window.removeEventListener('pointermove', setPointer)
      window.removeEventListener('mousemove', setPointer)
      window.removeEventListener('blur', hidePointer)
    }
  }, [])

  return <canvas className="goodsMark" aria-hidden="true" ref={canvasRef} />
}

const principles = [
  {
    titleLines: ['Решаем задачу пользователя,', 'а не собираем данные'],
    text: 'Каждый шаг должен быть связан с пользой для продажи. Поля и действия без влияния на результат нужно убирать.',
  },
  {
    titleLines: ['Система заполняет сама,', 'пользователь подтверждает'],
    text: 'Если данные можно взять из фото, прошлого объявления, профиля, категории, адресов, распознавания или шаблонов, сначала проверяем автозаполнение, подсказку или подтверждение вместо ручного ввода.',
  },
  {
    titleLines: ['Минимизируем энергозатраты', 'вместо экранов'],
    text: 'Важно снижать не только количество экранов, но и количество решений. Используем дефолты, рекомендации, превью и явную связь «действие → результат».',
  },
  {
    titleLines: ['Сначала достаточно,', 'потом идеально'],
    text: 'Сначала помогаем опубликовать достаточно хорошее объявление, потом — улучшать его. Улучшения, платные и дополнительные опции не должны блокировать завершение подачи.',
  },
  {
    titleLines: ['Пользователь понимает,', 'что осталось сделать'],
    text: 'Показываем прогресс, оставшиеся шаги и причину обязательных действий. Неожиданные этапы в конце подачи снижают завершение флоу.',
  },
  {
    titleLines: ['Интерфейс учитывает опыт', 'и контекст пользователя'],
    text: 'Новичку нужна поддержка, опытному продавцу — скорость. Не заставляем опытных пользователей проходить обучение и не перегружаем новичков лишними решениями.',
  },
]

const criteria: Criterion[] = [
  {
    id: 'new-block',
    label: 'Новый блок или точка входа',
    group: 'Сценарий',
    result: 'approval',
  },
  {
    id: 'new-field',
    label: 'Новое или изменённое поле',
    group: 'Поля и данные',
    result: 'approval',
  },
  {
    id: 'required-field',
    label: 'Новое обязательное поле',
    group: 'Поля и данные',
    result: 'approval',
  },
  {
    id: 'order',
    label: 'Изменение порядка полей или шагов',
    group: 'Сценарий',
    result: 'approval',
  },
  {
    id: 'navigation',
    label: 'Изменение основной кнопки, возврата назад, выхода или возврата в подачу',
    group: 'Навигация',
    result: 'approval',
  },
  {
    id: 'validation',
    label: 'Изменение проверки поля, ошибки или сохранения данных',
    group: 'Правила',
    result: 'approval',
  },
  {
    id: 'ai',
    label: 'Автозаполнение или AI-функция',
    group: 'Автоматизация',
    result: 'approval',
  },
  {
    id: 'publish-rules',
    label: 'Изменение правил публикации или черновика',
    group: 'Правила',
    result: 'approval',
  },
  {
    id: 'downstream-data',
    label:
      'Изменение данных для категории, параметров, модерации, поиска, рекомендаций, контактов или заказов',
    group: 'Поля и данные',
    result: 'approval',
  },
  {
    id: 'new-component',
    label: 'Новый компонент или новый способ взаимодействия',
    group: 'Дизайн',
    result: 'approval',
  },
  {
    id: 'outside-system',
    label: 'Элемент или визуальные значения вне дизайн-системы',
    group: 'Дизайн',
    result: 'approval',
  },
  {
    id: 'multi-platform',
    label: 'Решение для нескольких категорий или платформ',
    group: 'Масштаб',
    result: 'approval',
  },
  {
    id: 'platform-diff',
    label: 'Разное поведение на iOS, Android, Web или MAV',
    group: 'Масштаб',
    result: 'approval',
  },
  {
    id: 'sensitive',
    label: 'Изменение связано с деньгами, приватностью, безопасностью, законом или модерацией',
    group: 'Риски',
    result: 'approval',
  },
  {
    id: 'hard-disable',
    label: 'Для отключения нужен выпуск приложения, перенос данных или участие нескольких команд',
    group: 'Запуск',
    result: 'approval',
  },
  {
    id: 'copy-only',
    label: 'Меняется только текст, иллюстрация, отступ или расположение необязательного элемента',
    group: 'Информирование',
    result: 'inform',
  },
  {
    id: 'existing-components',
    label: 'Используются существующие компоненты дизайн-системы',
    group: 'Информирование',
    result: 'inform',
  },
  {
    id: 'same-behavior',
    label: 'Поведение одинаково на затронутых платформах',
    group: 'Информирование',
    result: 'inform',
  },
  {
    id: 'easy-disable',
    label: 'Фича отключается существующим способом',
    group: 'Информирование',
    result: 'inform',
  },
]

const stageLabels: Record<Stage, string> = {
  idea: 'Идея',
  solution: 'Решение',
}

const stageDescriptions: Record<Stage, string> = {
  idea: 'Есть гипотеза, но нет детального решения.',
  solution: 'Есть сценарий, макеты или описание.',
}

const screenDecisionLabels: Record<ScreenDecision, string> = {
  no: 'Нет, новый экран не нужен',
  'not-checked': 'Нужен новый экран, но альтернативы ещё не проверены',
  justified: 'Новый экран — единственный обоснованный вариант',
}

const criteriaSections = [
  {
    title: 'Сценарий, шаги и основные кнопки',
    description:
      'Новые блоки, порядок шагов, вход, выход, возврат и главное действие.',
    ids: ['new-block', 'order', 'navigation'],
  },
  {
    title: 'Поля, ввод и связанные данные',
    description:
      'Поля, обязательность, автозаполнение, проверки, сохранение и передача данных.',
    ids: ['new-field', 'required-field', 'ai', 'validation', 'downstream-data'],
  },
  {
    title: 'Новые компоненты и дизайн-система',
    description:
      'Новые способы взаимодействия и элементы вне дизайн-системы.',
    ids: ['new-component', 'outside-system'],
  },
  {
    title: 'Публикация, платформы и риски',
    description:
      'Черновик и публикация, различия платформ, чувствительные изменения и способ отключения.',
    ids: [
      'publish-rules',
      'multi-platform',
      'platform-diff',
      'sensitive',
      'hard-disable',
    ],
  },
  {
    title: 'Только текст, визуал и готовые компоненты',
    description:
      'Без нового сценария: готовые компоненты, одинаковое поведение и штатное отключение.',
    ids: ['copy-only', 'existing-components', 'same-behavior', 'easy-disable'],
  },
]

const approvalAttachments = [
  'что планируется изменить',
  'ссылка на макеты as is',
  'наброски, если есть',
  'подтверждающие данные',
]

const revokeReasons = [
  'пользователь не может закончить подачу или теряет данные',
  'возникает непреднамеренное платное действие или раскрытие данных',
  'нарушены требования закона, безопасности или модерации',
  'фича вышла за заявленную аудиторию или платформу',
  'сломаны правила публикации, черновика, модерации или передачи данных',
]

const stageTodos: Record<Stage, string[]> = {
  idea: [
    'приложить краткое описание и наброски, если есть',
    'принести идею в канал SX Goods для сверки подхода',
  ],
  solution: [
    'приложить макеты as is и наброски решения',
    'принести решение в канал SX Goods для сверки подхода',
  ],
}

function getResult(
  selectedCriteria: Criterion[],
  screenDecision: ScreenDecision,
): ResultType {
  if (screenDecision === 'not-checked') {
    return 'rethink'
  }

  if (
    screenDecision === 'justified' ||
    selectedCriteria.some((criterion) => criterion.result === 'approval')
  ) {
    return 'approval'
  }

  return 'inform'
}

function getResultTitle(result: ResultType) {
  if (result === 'rethink') {
    return 'Решение нужно переосмыслить'
  }

  if (result === 'approval') {
    return 'Нужно выровнять решение с SX Goods'
  }

  return 'Достаточно сообщить SX Goods'
}

function App() {
  const [stage, setStage] = useState<Stage>('idea')
  const [screenDecision, setScreenDecision] = useState<ScreenDecision>('no')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [copied, setCopied] = useState(false)
  const [openPrinciple, setOpenPrinciple] = useState<string | null>(null)
  const [openCriteriaSections, setOpenCriteriaSections] = useState<string[]>(
    criteriaSections[0]?.title ? [criteriaSections[0].title] : [],
  )

  const selectedCriteria = useMemo(
    () => criteria.filter((criterion) => selectedIds.includes(criterion.id)),
    [selectedIds],
  )

  const result = getResult(selectedCriteria, screenDecision)

  const resultTodos = useMemo(() => {
    if (result === 'rethink') {
      return [
        'не добавлять новый экран первым решением',
        'проверить существующие шаги, блоки или компоненты',
        'вернуться к чек-листу после переосмысления',
      ]
    }

    if (result === 'approval') {
      return [...stageTodos[stage]]
    }

    return [
      'написать короткое сообщение до запуска',
      'приложить макет/задачу, категорию, платформу и дату',
    ]
  }, [result, stage])

  const summaryText = [
    `Результат: ${getResultTitle(result)}`,
    `Этап: ${stageLabels[stage]}`,
    '',
    'Новый экран:',
    `— ${screenDecisionLabels[screenDecision]}`,
    '',
    'Отмеченные изменения:',
    ...(selectedCriteria.length
      ? selectedCriteria.map((criterion) => `— ${criterion.label}`)
      : ['— изменений не выбрано']),
    '',
    ...(result === 'approval'
      ? [
          'Что приложить:',
          ...approvalAttachments.map((item) => `— ${item}`),
          '',
        ]
      : []),
    'Что сделать:',
    ...resultTodos.map((todo) => `□ ${todo}`),
  ].join('\n')

  const toggleCriterion = (id: string) => {
    setCopied(false)
    setSelectedIds((currentIds) =>
      currentIds.includes(id)
        ? currentIds.filter((currentId) => currentId !== id)
        : [...currentIds, id],
    )
  }

  const updateScreenDecision = (decision: ScreenDecision) => {
    setCopied(false)
    setScreenDecision(decision)
  }

  const copySummary = async () => {
    await navigator.clipboard.writeText(summaryText)
    setCopied(true)
  }

  return (
    <main className="page">
      <section className="hero">
        <GoodsShader />
        <div className="hero__content glowTarget">
          <h1>
            <span>Проверьте, как&nbsp;выровнять</span>
            <span>изменение в&nbsp;подаче</span>
          </h1>
          <p className="lead">
            {keepShortWords(
              'Короткая проверка для команд Goods, которые меняют подачу объявления. Ответьте на несколько вопросов — чек-лист покажет, нужно ли сверить подход с SX Goods, достаточно ли просто сообщить о запуске или решение стоит пересобрать до разработки.',
            )}
          </p>
          <div className="hero__actions">
            <a className="button button_primary glowTarget" href="#quiz">
              Начать проверку
            </a>
            <a className="button button_secondary glowTarget" href="#criteria">
              Все критерии
            </a>
          </div>
        </div>
      </section>

      <section className="section principlesSection glowTarget">
        <div className="section__heading">
          <p className="eyebrow">Раздел 1</p>
          <h2>{keepShortWords('Основные принципы подачи')}</h2>
          <p>
            {keepShortWords(
              'Используйте их как быстрый фильтр: не добавляет ли решение лишний экран, ручной ввод или непонятный выбор для продавца.',
            )}
          </p>
        </div>
        <div className="principles">
          {principles.map((principle) => {
            const id = principle.titleLines.join(' ')
            const isOpen = openPrinciple === id

            return (
              <article
                className={`principle glowTarget${isOpen ? ' principle_open' : ''}`}
                key={id}
              >
                <button
                  aria-expanded={isOpen}
                  className="principle__summary"
                  type="button"
                  onClick={() => setOpenPrinciple((current) => (current === id ? null : id))}
                >
                <span>
                  {principle.titleLines.map((line) => (
                    <span className="principle__titleLine" key={line}>
                      {keepShortWords(line)}
                    </span>
                  ))}
                </span>
                </button>
                <p className="principle__text">{keepShortWords(principle.text)}</p>
              </article>
            )
          })}
        </div>
      </section>

      <section className="section quiz glowTarget" id="quiz">
        <div className="section__heading">
          <p className="eyebrow">Раздел 2</p>
          <h2>{keepShortWords('Интерактивный чек-лист выравнивания')}</h2>
          <p>
            {keepShortWords(
              'Отметьте стадию задачи и планируемые изменения. Результат пересчитается автоматически.',
            )}
          </p>
        </div>

        <div className="quiz__layout">
          <div className="quiz__form">
            <fieldset className="panel">
              <legend>1. На какой стадии задача?</legend>
              <div className="segmented">
                {Object.entries(stageLabels).map(([stageId, label]) => (
                  <label
                    className={
                      stage === stageId
                        ? 'segmented__item segmented__item_active glowTarget'
                        : 'segmented__item glowTarget'
                    }
                    key={stageId}
                  >
                    <input
                      checked={stage === stageId}
                      name="stage"
                      type="radio"
                      value={stageId}
                      onChange={() => setStage(stageId as Stage)}
                    />
                    <span>{keepShortWords(label)}</span>
                    <small>{keepShortWords(stageDescriptions[stageId as Stage])}</small>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="panel">
              <legend>2. Нужен ли новый экран?</legend>
              <div className="screenOptions">
                {Object.entries(screenDecisionLabels).map(([decision, label]) => (
                  <label
                    className={
                      screenDecision === decision
                        ? 'screenOption screenOption_active glowTarget'
                        : 'screenOption glowTarget'
                    }
                    key={decision}
                  >
                    <input
                      checked={screenDecision === decision}
                      name="screenDecision"
                      type="radio"
                      value={decision}
                      onChange={() =>
                        updateScreenDecision(decision as ScreenDecision)
                      }
                    />
                    <span>{keepShortWords(label)}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="panel panel_criteria">
              <legend>3. Что ещё планируется изменить?</legend>
              <div className="criteriaSections">
                {criteriaSections.map((section, index) => (
                  <div
                    className={
                      openCriteriaSections.includes(section.title)
                        ? 'criteriaSection criteriaSection_open'
                        : 'criteriaSection'
                    }
                    key={section.title}
                  >
                    <button
                      aria-controls={`criteria-section-${index}`}
                      aria-expanded={openCriteriaSections.includes(
                        section.title,
                      )}
                      className="criteriaSection__heading"
                      type="button"
                      onClick={() =>
                        setOpenCriteriaSections((currentSections) =>
                          currentSections.includes(section.title)
                            ? currentSections.filter(
                                (title) => title !== section.title,
                              )
                            : [...currentSections, section.title],
                        )
                      }
                    >
                      <span className="criteriaSection__headingCopy">
                        <h3>{keepShortWords(section.title)}</h3>
                        <span className="criteriaSection__description">
                          {keepShortWords(section.description)}
                        </span>
                      </span>
                      <span className="criteriaSection__icon" aria-hidden="true" />
                    </button>
                    <div
                      className="criteriaSection__panel"
                      id={`criteria-section-${index}`}
                    >
                      <div className="criteriaSection__panelInner">
                        <div className="criteriaSection__items">
                          {section.ids.map((id) => {
                            const criterion = criteria.find(
                              (item) => item.id === id,
                            )

                            if (!criterion) {
                              return null
                            }

                            return (
                              <label
                                className="check glowTarget"
                                key={criterion.id}
                              >
                                <input
                                  checked={selectedIds.includes(criterion.id)}
                                  type="checkbox"
                                  onChange={() => toggleCriterion(criterion.id)}
                                />
                                <span>{keepShortWords(criterion.label)}</span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </fieldset>
          </div>

          <aside className={`result result_${result} glowTarget`}>
            <p className="eyebrow">Результат</p>
            <h2>{keepShortWords(getResultTitle(result))}</h2>
            <p className="resultNote">
              {result === 'approval' && keepShortWords(
                'До запуска сверяем подход с SX Goods.',
              )}
              {result === 'rethink' && keepShortWords(
                'Пересоберите решение и пройдите проверку ещё раз.',
              )}
              {result === 'inform' && keepShortWords(
                'Отдельная сверка не нужна — сообщите SX Goods о запуске.',
              )}
            </p>
            <a className="result__revokeLink" href="#revoke">
              {keepShortWords('После запуска: когда SX Goods может остановить изменение')}
            </a>

            {result === 'approval' && (
              <>
                <h3>Что приложить</h3>
                <ul>
                  {approvalAttachments.map((item) => (
                    <li key={item}>{keepShortWords(item)}</li>
                  ))}
                </ul>
              </>
            )}

            <h3>Что сделать</h3>
            <ul className="todo">
              {resultTodos.map((todo) => (
                <li key={todo}>{keepShortWords(todo)}</li>
              ))}
            </ul>

            <div className="result__actions">
              <button
                className="button button_primary glowTarget"
                onClick={copySummary}
              >
                {copied ? 'Скопировано' : 'Скопировать todo-list'}
              </button>
              <a
                className="button button_secondary glowTarget"
                href={SX_GOODS_CHANNEL_URL}
                rel="noreferrer"
                target="_blank"
              >
                Перейти в канал SX Goods
              </a>
            </div>
          </aside>
        </div>
      </section>

      <section className="section revokeSection glowTarget" id="revoke">
        <div className="section__heading">
          <p className="eyebrow">Важно</p>
          <h2>{keepShortWords('Когда SX Goods может остановить уже запущенное изменение')}</h2>
          <p>
            {keepShortWords(
              'Это не запасной путь вместо сверки подхода. Если чек-лист показывает выравнивание с SX Goods, команда приходит до запуска. Если изменение запустили без нужной сверки или после запуска появился риск для подачи, SX Goods может попросить остановить тест, откатить или отключить изменение.',
            )}
          </p>
        </div>

        <ul className="revokeList">
          {revokeReasons.map((reason) => (
            <li key={reason}>
              <span className="revokeList__icon" aria-hidden="true">
                <svg viewBox="0 0 16 16" focusable="false">
                  <rect x="2.25" y="2.25" width="11.5" height="11.5" rx="1.75" />
                  <path d="M5.25 8h5.5" />
                </svg>
              </span>
              {keepShortWords(reason)}
            </li>
          ))}
        </ul>
      </section>

      <section className="section glowTarget" id="criteria">
        <div className="section__heading">
          <p className="eyebrow">Справочник</p>
          <h2>{keepShortWords('Все критерии целиком')}</h2>
          <p>
            {keepShortWords(
              'Этот блок нужен, если хочется проверить правила без прохождения квиза.',
            )}
          </p>
        </div>

        <div className="criteriaReference">
          {['Стоп-фактор', 'Выравнивание', 'Информирование'].map((title) => {
            const items =
              title === 'Стоп-фактор'
                ? [
                    {
                      id: 'new-screen-not-checked',
                      label:
                        'Нужен новый экран, но ещё не проверены варианты через существующие шаги, блоки или компоненты',
                    },
                  ]
                : criteria.filter((criterion) => {
                    if (title === 'Выравнивание') {
                      return criterion.result === 'approval'
                    }

                    return criterion.result === 'inform'
                  })

            return (
              <article className="referenceCard" key={title}>
                <h3>{keepShortWords(title)}</h3>
                <ul>
                  {items.map((item) => (
                    <li key={item.id}>{keepShortWords(item.label)}</li>
                  ))}
                </ul>
              </article>
            )
          })}
        </div>
      </section>

    </main>
  )
}

export default App
