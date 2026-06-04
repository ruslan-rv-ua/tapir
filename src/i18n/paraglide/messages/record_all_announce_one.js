/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ count: NonNullable<unknown> }} Record_All_Announce_OneInputs */

const uk_record_all_announce_one = /** @type {(inputs: Record_All_Announce_OneInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Розпочато запис: ${i?.count} потік`)
};

const en_record_all_announce_one = /** @type {(inputs: Record_All_Announce_OneInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Recording started: ${i?.count} stream`)
};

/**
* | output |
* | --- |
* | "Recording started: {count} stream" |
*
* @param {Record_All_Announce_OneInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const record_all_announce_one = /** @type {((inputs: Record_All_Announce_OneInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Record_All_Announce_OneInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_record_all_announce_one(inputs)
	return en_record_all_announce_one(inputs)
});