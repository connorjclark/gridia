import Client from './client';

abstract class ClientModule {
  constructor(public game: any) {}

  public onStart() {
    // empty
  }

  public onTick() {
    // empty
  }
}

export default ClientModule;
