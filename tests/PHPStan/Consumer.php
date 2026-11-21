<?php

use Filament\Actions\Action;
use Filament\Infolists\Components\TextEntry;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

function warpContextMenuConsumer(Table $table): array
{
    return [
        $table->contextMenu()->contextMenuBulkActions()->contextMenuCopyCell(false)->contextMenuLinks(false)->contextMenuClipboard(false)->contextMenuHeaders(false)->contextMenuTable(false),
        TextEntry::make('email')->contextMenu([Action::make('entryMail')])->contextMenuCopyValue(false)->label('Email'),
        TextColumn::make('email')->contextMenu([Action::make('mail')])->searchable(),
        Action::make('status')->contextMenuChecked(true)->contextMenuKeywords(['paid'])->contextMenuCopy(fn () => 'INV-1')->label('Status'),
    ];
}
