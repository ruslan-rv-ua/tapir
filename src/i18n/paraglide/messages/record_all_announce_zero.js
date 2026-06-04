/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Record_All_Announce_ZeroInputs */

const uk_record_all_announce_zero = /** @type {(inputs: Record_All_Announce_ZeroInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Немає потоків для запису`)
};

const en_record_all_announce_zero = /** @type {(inputs: Record_All_Announce_ZeroInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`No streams to record`)
};

/**
* | output |
* | --- |
* | "No streams to record" |
*
* @param {Record_All_Announce_ZeroInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const record_all_announce_zero = /** @type {((inputs?: Record_All_Announce_ZeroInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Record_All_Announce_ZeroInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_record_all_announce_zero(inputs)
	return en_record_all_announce_zero(inputs)
});