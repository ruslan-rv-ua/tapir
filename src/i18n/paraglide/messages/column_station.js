/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Column_StationInputs */

const uk_column_station = /** @type {(inputs: Column_StationInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Станція`)
};

const en_column_station = /** @type {(inputs: Column_StationInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Station`)
};

/**
* | output |
* | --- |
* | "Station" |
*
* @param {Column_StationInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const column_station = /** @type {((inputs?: Column_StationInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Column_StationInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_column_station(inputs)
	return en_column_station(inputs)
});