import {initializeApp} from 'firebase/app';
import {getAuth, EmailAuthProvider, GoogleAuthProvider} from 'firebase/auth';
import * as firebaseui from 'firebaseui';

import * as CommandBuilder from '../../protocol/command-builder.js';
import * as Helper from '../helper.js';

import {SceneController} from './scene-controller.js';
import {Scene} from './scene.js';
import {SelectCharacterScene} from './select-character-scene.js';

export class AccountScene extends Scene {
  private firebaseApp = initializeApp({
    apiKey: 'AIzaSyDQc_2k-ZcVnHxqTKp80OutU7y1LFp9zZA',
    authDomain: 'gridia-434b8.firebaseapp.com',
    projectId: 'gridia-434b8',
    storageBucket: 'gridia-434b8.appspot.com',
    messagingSenderId: '452601309463',
    appId: '1:452601309463:web:be64956cba8171c1beef52',
    measurementId: 'G-FB3PP93QG3',
  });
  private firebaseAuth = getAuth(this.firebaseApp);

  constructor(private controller: SceneController) {
    super(Helper.find('.account-scene'));
  }

  onShow() {
    super.onShow();

    const unsubscribe = this.firebaseAuth.onAuthStateChanged(async (user) => {
      unsubscribe();

      if (user) {
        const firebaseToken = await user.getIdToken(true);
        await this.login(firebaseToken);
        return;
      }

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
    });
  }

  async onFirebaseAuthSuccess(authResult: any) {
    if (!this.firebaseAuth.currentUser) return;

    const firebaseToken = await this.firebaseAuth.currentUser.getIdToken(true);
    if (authResult.additionalUserInfo.isNewUser) {
      await this.controller.client.connection.sendCommand(CommandBuilder.registerAccount({
        firebaseToken,
      }));
    }

    await this.login(firebaseToken);
  }

  async login(firebaseToken: string) {
    const response = await this.controller.client.connection.sendCommand(CommandBuilder.login({
      firebaseToken,
    }));
    this.controller.client.firebaseToken = firebaseToken;
    this.controller.pushScene(new SelectCharacterScene(this.controller, response));
  }
}
