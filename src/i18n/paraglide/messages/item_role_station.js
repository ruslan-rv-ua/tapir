/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Item_Role_StationInputs */

const uk_item_role_station = /** @type {(inputs: Item_Role_StationInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`станція`)
};

const en_item_role_station = /** @type {(inputs: Item_Role_StationInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`station`)
};

/**
* | output |
* | --- |
* | "station" |
*
* @param {Item_Role_StationInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const item_role_station = /** @type {((inputs?: Item_Role_StationInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Item_Role_StationInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_item_role_station(inputs)
	return en_item_role_station(inputs)
});