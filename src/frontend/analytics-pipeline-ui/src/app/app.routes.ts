import { Routes } from '@angular/router';
import { v4 as uuidv4 } from 'uuid';

import { Chat } from './chat/chat';

export const routes: Routes = [
  {
    path: 'chat',
    component: Chat,
    data: { sessionId: uuidv4() },
  },
];
