/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ title: NonNullable<unknown>, artist: NonNullable<unknown>, station: NonNullable<unknown>, size: NonNullable<unknown>, date: NonNullable<unknown> }} Songs_Row_SummaryInputs */

const uk_songs_row_summary = /** @type {(inputs: Songs_Row_SummaryInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`${i?.title}, виконавець ${i?.artist}, станція ${i?.station}, ${i?.size}, записано ${i?.date}`)
};

const en_songs_row_summary = /** @type {(inputs: Songs_Row_SummaryInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`${i?.title}, artist ${i?.artist}, station ${i?.station}, ${i?.size}, recorded ${i?.date}`)
};

/**
* | output |
* | --- |
* | "{title}, artist {artist}, station {station}, {size}, recorded {date}" |
*
* @param {Songs_Row_SummaryInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const songs_row_summary = /** @type {((inputs: Songs_Row_SummaryInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Songs_Row_SummaryInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_songs_row_summary(inputs)
	return en_songs_row_summary(inputs)
});