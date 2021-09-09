import {initializeApp} from 'firebase/app';
import {getAuth, EmailAuthProvider, GoogleAuthProvider} from 'firebase/auth';
import * as firebaseui from 'firebaseui';

import * as CommandBuilder from '../../protocol/command-builder';
import * as Helper from '../helper';

import {Scene} from './scene';
import {SceneController} from './scene-controller';
import {SelectCharacterScene} from './select-character-scene';

export class AccountScene extends Scene {
  private firebaseApp: any;
  private firebaseAuth: any;

  constructor(private controller: SceneController) {
    super(Helper.find('.account-scene'));

    this.firebaseApp = initializeApp({
      apiKey: 'AIzaSyDQc_2k-ZcVnHxqTKp80OutU7y1LFp9zZA',
      authDomain: 'gridia-434b8.firebaseapp.com',
      projectId: 'gridia-434b8',
      storageBucket: 'gridia-434b8.appspot.com',
      messagingSenderId: '452601309463',
      appId: '1:452601309463:web:be64956cba8171c1beef52',
      measurementId: 'G-FB3PP93QG3',
    });
    this.firebaseAuth = getAuth(this.firebaseApp);

    Helper.createChildOf(document.head, 'link', '', {
      rel: 'stylesheet',
      href: 'https://www.gstatic.com/firebasejs/ui/5.0.0/firebase-ui-auth.css',
    });
    const ui = new firebaseui.auth.AuthUI(this.firebaseAuth);
    ui.start('.firebaseui-auth-container', {
      signInOptions: [
        GoogleAuthProvider.PROVIDER_ID,
        {
          provider: EmailAuthProvider.PROVIDER_ID,
          requireDisplayName: false,
        },
      ],
      signInFlow: 'popup',
      callbacks: {
        signInSuccessWithAuthResult: (authResult) => {
          this.onFirebaseAuthSuccess(authResult);
          // Return control to the game (no redirect).
          return false;
        },
      },
    });
  }

  async onFirebaseAuthSuccess(authResult: any) {
    const firebaseToken = await this.firebaseAuth.currentUser.getIdToken(true);
    if (authResult.additionalUserInfo.isNewUser) {
      await this.controller.client.connection.sendCommand(CommandBuilder.registerAccount({
        firebaseToken,
      }));
    }
    const response = await this.controller.client.connection.sendCommand(CommandBuilder.login({
      firebaseToken,
    }));
    this.controller.pushScene(new SelectCharacterScene(this.controller, response));
  }
}
