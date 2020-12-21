import * as Content from '../../content';
import * as ProtocolBuilder from '../../protocol/client-to-server-protocol-builder';
import * as Utils from '../../utils';
import ClientModule from '../client-module';
import * as Draw from '../draw';
import * as Helper from '../helper';

class UsageModule extends ClientModule {
  protected possibleUsagesWindow = new Draw.PossibleUsagesWindow();

  public onStart() {
    this.possibleUsagesWindow.pixiContainer.y = 0;
    this.possibleUsagesWindow.setOnSelectUsage((possibleUsage) => {
      this.game.client.connection.send(ProtocolBuilder.use({
        toolIndex: possibleUsage.toolIndex,
        location: possibleUsage.focusLocation,
      }));
    });
    this.game.addWindow(this.possibleUsagesWindow);
  }

  public onTick() {
    // empty.
  }

  public updatePossibleUsages(center?: TilePoint) {
    this.possibleUsagesWindow.setPossibleUsages(this.getPossibleUsages(center));
  }

  // TODO: better comment. maybe some bullet points. mhm.
  // If item is selected in world, only return usages that use that item as the focus.
  // Else show all usages possible using any tool on any item in inventory or nearby in the world.
  // If a usage is possible with distinct items (example: standing near many trees with an axe),
  // only the first instance will be recorded.
  // If a tool in the inventory is selected, filter results to just usages that use that tool.
  // If a an item in the world is selected, filter results to just usages that use that tool.
  public getPossibleUsages(center?: TilePoint): PossibleUsage[] {
    const game = this.game;

    center = center || game.getPlayerCreature().pos;
    const selectedTool = Helper.getSelectedTool();
    const selectedTile = game.state.selectedView.tile;

    const possibleUsageActions: PossibleUsage[] = [];
    const inventory = game.client.inventory;
    if (!inventory) return [];

    const nearbyItems: Array<{ loc: TilePoint; item?: Item }> = [];
    game.client.context.map.forEach(center, 1, (loc, tile) => {
      // If a tile is selected, limit results to usages on that tile.
      if (selectedTile && !Utils.equalPoints(selectedTile, loc)) return;

      nearbyItems.push({ loc, item: tile.item });
    });

    inventory.forEach((tool, toolIndex) => {
      if (selectedTool && selectedTool !== tool) return;

      const possibleUses = Content.getItemUsesForTool(tool.type);
      for (const use of possibleUses) {
        // TODO: dont yet support focus items being in inventory.
        // Only record one, if any, from inventory.
        // const possibleFocusFromInventory = inventory.items.find((item) => item?.type === use.focus);
        // if (possibleFocusFromInventory) {
        //   possibleUsageActions.push({
        //     toolIndex,
        //     use,
        //     focusLocation: Utils.ItemLocation.Container(
        //       this.client.containerId, inventory.items.indexOf(possibleFocusFromInventory)),
        //   });
        // }

        for (const nearbyItem of nearbyItems) {
          if (nearbyItem.item?.type !== use.focus) continue;
          possibleUsageActions.push({
            toolIndex,
            use,
            focusLocation: Utils.ItemLocation.World(nearbyItem.loc),
          });
        }
      }
    });

    // The implicit sort depends on where the player happens to be, and is unstable.
    // Use some arbirtary sorting to keep the results more stable.
    possibleUsageActions.sort((a, b) => b.use.tool - a.use.tool);

    return possibleUsageActions;
  }
}

export default UsageModule;
