import { it } from 'vitest';
import { parseSequentialTrainText, parseInlineTeamRoster } from '@/lib/train-parser';
const text = `5 команда
Ковальчук Іван Іванович
Львів
.
Петренко Марія Петрівна
SS
Сидоренко Олег Олегович`;
it('dbg', () => { console.log('inline', parseInlineTeamRoster(text)); console.log('seq', parseSequentialTrainText(text)); });
