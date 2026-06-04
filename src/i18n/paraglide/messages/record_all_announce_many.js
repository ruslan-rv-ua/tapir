/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ count: NonNullable<unknown> }} Record_All_Announce_ManyInputs */

const uk_record_all_announce_many = /** @type {(inputs: Record_All_Announce_ManyInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Розпочато запис: ${i?.count} потоків`)
};

const en_record_all_announce_many = /** @type {(inputs: Record_All_Announce_ManyInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Recording started: ${i?.count} streams`)
};

/**
* | output |
* | --- |
* | "Recording started: {count} streams" |
*
* @param {Record_All_Announce_ManyInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const record_all_announce_many = /** @type {((inputs: Record_All_Announce_ManyInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Record_All_Announce_ManyInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_record_all_announce_many(inputs)
	return en_record_all_announce_many(inputs)
});