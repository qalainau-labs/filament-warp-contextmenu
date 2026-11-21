<?php

use Filament\Actions\Action;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

function warpContextMenuConsumer(Table $table): array
{
    return [
        $table->contextMenu()->contextMenuBulkActions()->contextMenuCopyCell(false)->contextMenuLinks(false),
        TextColumn::make('email')->contextMenu([Action::make('mail')])->searchable(),
        Action::make('status')->contextMenuChecked(true)->label('Status'),
    ];
}
