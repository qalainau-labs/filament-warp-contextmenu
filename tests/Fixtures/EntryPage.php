<?php

namespace Qalainau\FilamentWarpContextMenu\Tests\Fixtures;

use Filament\Actions\Action;
use Filament\Actions\ActionGroup;
use Filament\Infolists\Components\TextEntry;
use Filament\Pages\Page;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;

class EntryPage extends Page
{
    protected string $view = 'warp-contextmenu::test-entry-page';

    public function infolist(Schema $schema): Schema
    {
        return $schema->record(Customer::first())->components([
            TextEntry::make('name')->contextMenu(fn () => [
                ActionGroup::make([
                    Action::make('renameEntry')->label('Rename entry')->action(fn (Customer $record) => $record->update(['name' => 'Entry renamed'])),
                    Action::make('forbidden')->authorize(false),
                    Action::make('hidden')->hidden(),
                ])->label('Entry group'),
            ]),
            TextEntry::make('readable')->state('Visible value'),
            TextEntry::make('email')->contextMenuCopyValue(false),
            TextEntry::make('secret')->hidden()->contextMenu([Action::make('secretAction')]),
            Section::make('Hidden parent')->hidden()->schema([TextEntry::make('nestedSecret')->contextMenu([Action::make('nestedSecretAction')])]),
        ]);
    }
}
