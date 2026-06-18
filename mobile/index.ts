import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';

import { setupKeyboardDismissBehavior } from './src/lib/setupKeyboardDismiss';
import App from './App';

setupKeyboardDismissBehavior();

registerRootComponent(App);
