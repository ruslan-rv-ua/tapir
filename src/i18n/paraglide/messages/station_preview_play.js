/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown> }} Station_Preview_PlayInputs */

const uk_station_preview_play = /** @type {(inputs: Station_Preview_PlayInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Прослухати ${i?.name}`)
};

const en_station_preview_play = /** @type {(inputs: Station_Preview_PlayInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Listen to ${i?.name}`)
};

/**
* | output |
* | --- |
* | "Listen to {name}" |
*
* @param {Station_Preview_PlayInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const station_preview_play = /** @type {((inputs: Station_Preview_PlayInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Station_Preview_PlayInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_station_preview_play(inputs)
	return en_station_preview_play(inputs)
});